package com.meponto.rider.data

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Security
import com.meponto.rider.ui.theme.Tone

/**
 * Static presentation config — NOT user data.
 *
 * All per-rider figures (earnings, points, shifts, products, ledger, partners…)
 * now come from the PontoSys API only; no demo/mock user data ships in the app
 * (see docs/rider-app-data-closed-loop.md). What remains here is fixed app
 * configuration: the tier-ladder reference shown on Home, and the Support
 * screen's action shortcuts. These are presentation constants, not fake data.
 */
object MockData {

    /** Tier ladder reference (score bands) shown as a guide on Home. */
    val tiers = listOf(
        Tier(64, "Base", "Primeiros ganhos", "0–71"),
        Tier(78, "Consistente", "Boa presença", "72–85"),
        Tier(92, "Forte", "Alta performance", "86–99"),
        Tier(102, "Elite", "Prioridade local", "100–107"),
        Tier(112, "Top", "Brilho máximo", "108+"),
    )

    /** Support screen action shortcuts (navigation entries, localized by key). */
    val helpActions = listOf(
        HelpAction("support.safety", "Abrir chamado urgente no Ponto", Icons.Filled.Security, Tone.DANGER),
        HelpAction("support.chat", "Atendimento pelo chat do app", Icons.Filled.Chat, Tone.ACCENT),
        HelpAction("support.account", "PIN, aparelho e dados sensíveis", Icons.Filled.Lock, Tone.NEUTRAL),
    )
}
