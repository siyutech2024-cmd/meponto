package com.meponto.rider.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalStore
import com.meponto.rider.data.remote.SupportTicketDto
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.Screen
import com.meponto.rider.ui.components.SectionHeader
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.bg
import com.meponto.rider.ui.theme.fg
import kotlinx.coroutines.launch

/**
 * 客服闭环 / Suporte — native tickets: submit in-app, HQ answers from the
 * /support queue, the reply comes back as inbox message + push and shows
 * here under the ticket. The web portal stays as a secondary entry.
 */
@Composable
fun SupportScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var tickets by remember { mutableStateOf<List<SupportTicketDto>>(emptyList()) }
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }

    LaunchedEffect(reloadKey) { tickets = store.myTickets() }

    val supportUrl = com.meponto.rider.BuildConfig.BASE_URL
        .removeSuffix("api/").removeSuffix("api") + "rider-app/support"

    val faqs = listOf(
        loc.t("faq.q1") to loc.t("faq.a1"),
        loc.t("faq.q2") to loc.t("faq.a2"),
        loc.t("faq.q3") to loc.t("faq.a3"),
    )

    Screen(title = loc.t("support.title")) {
        // ---- New ticket ----
        Panel {
            SectionHeader(loc.t("support.newTicket"))
            Spacer(Modifier.size(10.dp))
            OutlinedTextField(
                value = subject, onValueChange = { subject = it.take(80) },
                label = { Text(loc.t("support.subject")) }, singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.size(8.dp))
            OutlinedTextField(
                value = message, onValueChange = { message = it.take(1000) },
                label = { Text(loc.t("support.message")) }, minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.size(10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (sending || subject.isBlank() || message.isBlank()) me.line else me.accent)
                    .clickable(enabled = !sending && subject.isNotBlank() && message.isNotBlank()) {
                        sending = true
                        feedback = null
                        scope.launch {
                            val error = store.createTicket(subject.trim(), message.trim())
                            sending = false
                            if (error == null) {
                                subject = ""; message = ""
                                feedback = loc.t("support.sent")
                                reloadKey += 1
                            } else {
                                feedback = error
                            }
                        }
                    }
                    .padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Send, contentDescription = null, tint = me.accentInk, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    if (sending) loc.t("support.sending") else loc.t("support.send"),
                    color = me.accentInk, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                )
            }
            feedback?.let {
                Spacer(Modifier.size(8.dp))
                Text(it, color = me.muted, fontSize = 12.sp)
            }
        }

        // ---- My tickets ----
        if (tickets.isNotEmpty()) {
            Panel {
                SectionHeader(loc.t("support.myTickets"))
                Spacer(Modifier.size(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    tickets.take(10).forEach { ticket -> TicketItem(ticket) }
                }
            }
        }

        // ---- Secondary web/WhatsApp entries + FAQ ----
        Panel {
            store.helpActions.forEachIndexed { idx, action ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clickable {
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(supportUrl))) }
                        }
                        .padding(vertical = 10.dp),
                ) {
                    Box(
                        Modifier.size(36.dp).clip(CircleShape).background(action.tone.bg(me)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(action.icon, contentDescription = null, tint = action.tone.fg(me), modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(loc.t(action.titleKey), color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text(action.detail, color = me.muted, fontSize = 12.sp)
                    }
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = me.muted)
                }
                if (idx < store.helpActions.size - 1) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(me.line))
                }
            }
        }

        Panel {
            SectionHeader(loc.t("support.faq"))
            Spacer(Modifier.size(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                faqs.forEach { (q, a) -> FaqItem(q, a) }
            }
        }
    }
}

@Composable
private fun TicketItem(ticket: SupportTicketDto) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val statusKey = when (ticket.status) {
        "answered" -> "support.statusAnswered"
        "resolved" -> "support.statusResolved"
        else -> "support.statusOpen"
    }
    val statusColor = when (ticket.status) {
        "answered" -> me.accent
        "resolved" -> me.muted
        else -> me.text
    }
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                ticket.subject ?: "", color = me.text, fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp, modifier = Modifier.weight(1f),
            )
            Text(loc.t(statusKey), color = statusColor, fontWeight = FontWeight.Bold, fontSize = 11.sp)
        }
        Text(ticket.createdAt ?: "", color = me.muted, fontSize = 11.sp)
        val reply = ticket.reply
        if (!reply.isNullOrBlank()) {
            Spacer(Modifier.size(6.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(me.line.copy(alpha = 0.35f))
                    .padding(10.dp),
            ) {
                Text(loc.t("support.replyLabel"), color = me.accent, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                Text(reply, color = me.textSoft, fontSize = 13.sp)
            }
        }
        Spacer(Modifier.size(4.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(me.line))
    }
}

@Composable
private fun FaqItem(question: String, answer: String) {
    val me = LocalMe.current
    var expanded by remember { mutableStateOf(false) }
    Column {
        Row(
            modifier = Modifier.clickable { expanded = !expanded }.padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(question, color = me.textSoft, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ExpandMore, contentDescription = null, tint = me.accent)
        }
        AnimatedVisibility(visible = expanded) {
            Text(answer, color = me.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp, bottom = 4.dp))
        }
    }
}
