package com.meponto.rider.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalStore
import com.meponto.rider.data.Shift
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.Badge
import com.meponto.rider.ui.components.OverlayTopBar
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.components.Screen
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.Tone
import kotlin.math.ceil

@Composable
fun ShiftsScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val auth = LocalAuth.current

    var selectedWeek by remember { mutableIntStateOf(0) }
    var selectedDay by remember { mutableStateOf("") }
    var agendaPage by remember { mutableIntStateOf(0) }
    var detailId by remember { mutableStateOf<Int?>(null) }
    val agendaPageSize = 3

    val weeks = store.riderWeeks
    val weekIndex = selectedWeek.coerceIn(0, maxOf(weeks.size - 1, 0))
    val weekDays = if (weeks.isEmpty()) emptyList() else weeks[weekIndex]
    val activeDay = if (selectedDay.isNotEmpty() && weekDays.any { it.id == selectedDay }) {
        selectedDay
    } else {
        weekDays.firstOrNull()?.id ?: ""
    }
    val dayShifts = store.shiftsOn(activeDay).sortedBy { it.window }

    val agenda = store.subscribedShifts
    val agendaPageCount = maxOf(1, ceil(agenda.size / agendaPageSize.toDouble()).toInt())
    val agendaSlice = run {
        val p = agendaPage.coerceIn(0, agendaPageCount - 1)
        val start = p * agendaPageSize
        agenda.subList(start, minOf(start + agendaPageSize, agenda.size))
    }

    // Detail overlay (subscribe / cancel)
    detailId?.let { id ->
        ShiftDetail(shiftId = id, onBack = { detailId = null })
        return
    }

    Screen(title = loc.t("shifts.title")) {
        // 网点 header
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.LocationOn, contentDescription = null, tint = me.accent, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(store.profile.ponto, color = me.text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(loc.t("shifts.pontoOnly"), color = me.muted, fontSize = 11.sp)
                }
                Badge(store.profile.bairro, Tone.NEUTRAL)
            }
        }

        // 我的日程 / agenda with pagination (member only)
        if (auth.isMember && agenda.isNotEmpty()) {
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(loc.t("shifts.agenda"), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                    Text("${agenda.size}", color = me.muted, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
                Spacer(Modifier.size(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    agendaSlice.forEach { s ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.EventAvailable, contentDescription = null, tint = me.ok, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text("${s.weekday} ${s.dayLabel} · ${s.window}", color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                Text(s.zone, color = me.muted, fontSize = 11.sp)
                            }
                            Badge(loc.t(s.status.key), s.status.tone)
                        }
                    }
                }
                if (agendaPageCount > 1) {
                    Spacer(Modifier.size(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.ChevronLeft, contentDescription = "Prev", tint = me.text,
                            modifier = Modifier
                                .alpha(if (agendaPage == 0) 0.3f else 1f)
                                .clickable(enabled = agendaPage > 0) { agendaPage-- }
                                .padding(6.dp),
                        )
                        Text(
                            "${agendaPage.coerceIn(0, agendaPageCount - 1) + 1} / $agendaPageCount",
                            color = me.muted, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                            textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
                        )
                        Icon(
                            Icons.Filled.ChevronRight, contentDescription = "Next", tint = me.text,
                            modifier = Modifier
                                .alpha(if (agendaPage >= agendaPageCount - 1) 0.3f else 1f)
                                .clickable(enabled = agendaPage < agendaPageCount - 1) { agendaPage++ }
                                .padding(6.dp),
                        )
                    }
                }
            }
        }

        // Week switcher
        val relLabel = if (weekIndex == 0) loc.t("shifts.thisWeek") else if (weekIndex == 1) loc.t("shifts.nextWeek") else ""
        val range = weekDays.firstOrNull()?.let { "${it.dayLabel} – ${weekDays.last().dayLabel}" } ?: ""
        val weekLabel = if (relLabel.isEmpty()) range else "$relLabel · $range"
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp)) {
            Icon(
                Icons.Filled.ChevronLeft, contentDescription = "Prev week", tint = me.text,
                modifier = Modifier
                    .alpha(if (weekIndex == 0) 0.3f else 1f)
                    .clickable(enabled = weekIndex > 0) { selectedWeek = weekIndex - 1; selectedDay = "" }
                    .padding(8.dp),
            )
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = me.accent, modifier = Modifier.size(16.dp))
                Text(weekLabel, color = me.text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            Icon(
                Icons.Filled.ChevronRight, contentDescription = "Next week", tint = me.text,
                modifier = Modifier
                    .alpha(if (weekIndex >= weeks.size - 1) 0.3f else 1f)
                    .clickable(enabled = weekIndex < weeks.size - 1) { selectedWeek = weekIndex + 1; selectedDay = "" }
                    .padding(8.dp),
            )
        }

        // Day strip
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            weekDays.forEach { day ->
                val isActive = day.id == activeDay
                Column(
                    modifier = Modifier
                        .width(56.dp)
                        .clip(RoundedCornerShape(MeRadius.card))
                        .background(if (isActive) me.accent else me.surface)
                        .then(if (isActive) Modifier else Modifier.border(1.dp, me.line, RoundedCornerShape(MeRadius.card)))
                        .clickable { selectedDay = day.id }
                        .padding(vertical = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(day.weekday.uppercase(), color = if (isActive) me.accentInk else me.muted, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    Text(day.dayLabel, color = if (isActive) me.accentInk else me.text, fontWeight = FontWeight.Black, fontSize = 14.sp)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        Box(
                            Modifier.size(5.dp).clip(CircleShape).background(
                                if (day.subscribedCount > 0) me.ok else if (isActive) me.accentInk.copy(alpha = 0.5f) else me.muted.copy(alpha = 0.5f)
                            )
                        )
                        Text("${day.shiftIds.size}", color = if (isActive) me.accentInk else me.muted, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    }
                }
            }
        }

        // Selected day's shifts
        Panel {
            if (dayShifts.isEmpty()) {
                Text(
                    loc.t("shifts.empty"), color = me.muted, fontSize = 14.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                )
            } else {
                dayShifts.forEachIndexed { idx, shift ->
                    ScheduleRow(shift = shift) { detailId = shift.id }
                    if (idx < dayShifts.size - 1) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(me.line))
                    }
                }
            }
        }

        Text(loc.t("shifts.noPayNote"), color = me.muted, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun ScheduleRow(shift: Shift, onClick: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(shift.window, color = me.text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                if (shift.critical) {
                    Text(
                        loc.t("shifts.critical"), color = me.danger, fontWeight = FontWeight.Bold, fontSize = 11.sp,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(me.danger.copy(alpha = 0.15f))
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
            }
            Text("${loc.t("shifts.hotzone")}: ${shift.hotzone}", color = me.muted, fontSize = 12.sp)
        }
        if (shift.subscribed) {
            Badge(loc.t(shift.status.key), shift.status.tone)
        } else {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${shift.openSpots}/${shift.totalSpots}",
                    color = if (shift.openSpots == 0) me.danger else me.text,
                    fontWeight = FontWeight.Bold, fontSize = 14.sp,
                )
                Text(loc.t("shifts.spots"), color = me.muted, fontSize = 11.sp)
            }
        }
        Spacer(Modifier.width(8.dp))
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = me.muted, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun ShiftDetail(shiftId: Int, onBack: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val auth = LocalAuth.current
    val shift = store.shifts.firstOrNull { it.id == shiftId }

    Column(Modifier.fillMaxSize().background(me.background)) {
        OverlayTopBar(title = loc.t("shifts.title"), onClose = onBack)
        if (shift == null) return@Column
        Column(
            modifier = Modifier.fillMaxSize().padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column {
                Text("${shift.weekday} ${shift.dayLabel} · ${shift.window}", color = me.text, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Text(shift.zone, color = me.muted, fontSize = 14.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Badge("${loc.t("shifts.hotzone")}: ${shift.hotzone}", Tone.ACCENT)
                Badge("${loc.t("shift.station")}: ${shift.station}", Tone.NEUTRAL)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (shift.critical) Badge(loc.t("shifts.critical"), Tone.DANGER)
                if (shift.subscribed) Badge(loc.t(shift.status.key), shift.status.tone)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Groups, contentDescription = null, tint = me.muted, modifier = Modifier.size(18.dp))
                Text("${shift.takenSpots}/${shift.totalSpots} · ${shift.openSpots} ${loc.t("shifts.spots")}", color = me.textSoft, fontSize = 14.sp)
            }
            Text(loc.t("shifts.noPayNote"), color = me.muted, fontSize = 12.sp)
            Spacer(Modifier.weight(1f))
            if (shift.subscribed) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(MeRadius.card))
                        .border(1.dp, me.danger.copy(alpha = 0.4f), RoundedCornerShape(MeRadius.card))
                        .clickable { store.toggleSubscription(shift); onBack() }
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(loc.t("shifts.cancel"), color = me.danger, fontWeight = FontWeight.SemiBold)
                }
            } else {
                PrimaryButton(
                    title = loc.t("shifts.subscribe"),
                    icon = Icons.Filled.CheckCircle,
                    enabled = shift.openSpots > 0,
                ) {
                    if (auth.requireMember()) {
                        store.toggleSubscription(shift) // routes enroll → POST /slots
                        onBack()
                    }
                }
            }
        }
    }
}
