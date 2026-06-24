package com.meponto.rider.data

import androidx.compose.ui.graphics.Color
import kotlin.math.roundToInt

/**
 * MePonto rider membership tier — ported 1:1 from app/rider-app/page.tsx
 * (getRiderTierScore + getRiderTierByScore). The score blends today's
 * performance with the rider's consistency/incident history; thresholds map to
 * 1★ → 2★ → 3★ → Gold → Diamond.
 */
data class RiderTierInfo(
    val key: String,     // base | green | orange | gold | diamond
    val label: String,   // 1 ★ / 2 ★ / 3 ★ / Gold / Diamond
    val stars: Int,
    val benefit: String,
    val nextTarget: String,
) {
    val gradient: List<Color>
        get() = when (key) {
            "diamond" -> listOf(Color(0xFF07111F), Color(0xFF123B53), Color(0xFFBEF0F7))
            "gold" -> listOf(Color(0xFF1D1202), Color(0xFF9A5B08), Color(0xFFFFB238))
            "orange" -> listOf(Color(0xFF120B05), Color(0xFF783900), Color(0xFFFF7A00))
            "green" -> listOf(Color(0xFF06150E), Color(0xFF0F5130), Color(0xFF20A65A))
            else -> listOf(Color(0xFF050505), Color(0xFF161616))
        }

    val accent: Color
        get() = when (key) {
            "diamond" -> Color(0xFFA8F3FF)
            "gold" -> Color(0xFFFFE2A3)
            "orange" -> Color(0xFFFFB16A)
            "green" -> Color(0xFF91E8B4)
            else -> Color(0xFFFF7A00)
        }
}

object RiderTier {

    // Today's performance inputs (mirrors `performanceToday` in the web app).
    fun score(
        ar: Int,
        nightShiftCount: Int,
        incidentCount: Int,
        orders: Int = 18,
        tshHours: Double = 7.4,
        acceptanceToday: Int = 96,
        caaOrders: Int = 5,
    ): Int {
        val orderScore = minOf(orders, 24) * 1.2
        val tshScore = minOf(tshHours, 10.0) * 2.2
        val arScore = maxOf(0, acceptanceToday - 70) * 1.4
        val caaScore = minOf(caaOrders, 8) * 3.0
        val consistencyScore = minOf(nightShiftCount, 18) * 0.8
        val incidentPenalty = incidentCount * 8.0
        return (orderScore + tshScore + arScore + caaScore + consistencyScore - incidentPenalty + 12).roundToInt()
    }

    fun byScore(score: Int): RiderTierInfo = when {
        score >= 108 -> RiderTierInfo("diamond", "Diamond", 5, "Max perks", "Topo Diamond")
        score >= 100 -> RiderTierInfo("gold", "Gold", 4, "Fila premium", "${108 - score} pts → Diamond")
        score >= 86 -> RiderTierInfo("orange", "3 ★", 3, "Bônus pontos", "${100 - score} pts → Gold")
        score >= 72 -> RiderTierInfo("green", "2 ★", 2, "Mais missões", "${86 - score} pts → 3 ★")
        else -> RiderTierInfo("base", "1 ★", 1, "Base ativa", "${maxOf(0, 72 - score)} pts → 2 ★")
    }
}

/**
 * Rider membership / identity profile (会员资料), mirrors fields on the web
 * Rider model: ponto (网点), leader (队长), bairro (片区), 99 ID.
 */
data class MembershipProfile(
    val name: String,
    val ponto: String,
    val leader: String,
    val bairro: String,
    val ninetyNineId: String,
    val ar: Int,
    val nightShiftCount: Int,
    val incidentCount: Int,
    // Identity / payout details (editable; required before requesting a payout).
    val cpf: String = "",
    val phone: String = "",
    val pix: String = "",
) {
    val tierScore: Int get() = RiderTier.score(ar, nightShiftCount, incidentCount)
    val tier: RiderTierInfo get() = RiderTier.byScore(tierScore)
    /** Payout requires CPF + PIX + phone all present. */
    val isComplete: Boolean get() = cpf.isNotBlank() && pix.isNotBlank() && phone.isNotBlank()
}
