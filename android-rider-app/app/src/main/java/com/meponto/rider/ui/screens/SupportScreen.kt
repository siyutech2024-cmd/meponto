package com.meponto.rider.ui.screens

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.Screen
import com.meponto.rider.ui.components.SectionHeader
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.bg
import com.meponto.rider.ui.theme.fg

@Composable
fun SupportScreen() {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current

    val faqs = listOf(
        loc.t("faq.q1") to loc.t("faq.a1"),
        loc.t("faq.q2") to loc.t("faq.a2"),
        loc.t("faq.q3") to loc.t("faq.a3"),
    )

    Screen(title = loc.t("support.title")) {
        Panel {
            store.helpActions.forEachIndexed { idx, action ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 10.dp)) {
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
