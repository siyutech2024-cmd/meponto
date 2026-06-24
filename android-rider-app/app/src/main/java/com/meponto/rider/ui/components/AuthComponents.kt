package com.meponto.rider.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PersonAddAlt1
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius

/** Accent CTA shown to guests where member content would be → opens the auth sheet. */
@Composable
fun LoginPromptCard(message: String? = null) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val auth = LocalAuth.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeRadius.card))
            .background(me.accent)
            .clickable { auth.requireMember() }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.PersonAddAlt1, contentDescription = null, tint = me.accentInk, modifier = Modifier.size(26.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(loc.t("auth.welcome"), color = me.accentInk, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(message ?: loc.t("auth.guestPrompt"), color = me.accentInk.copy(alpha = 0.75f), fontSize = 12.sp)
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = me.accentInk)
    }
}

/** Shared empty / error state used by lists and load failures. */
@Composable
fun StateView(icon: ImageVector, message: String, actionTitle: String? = null, onAction: (() -> Unit)? = null) {
    val me = LocalMe.current
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, contentDescription = null, tint = me.muted, modifier = Modifier.size(40.dp))
        Text(message, color = me.muted, fontSize = 14.sp, textAlign = TextAlign.Center)
        if (actionTitle != null && onAction != null) {
            Text(
                actionTitle,
                color = me.accent,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                modifier = Modifier.clickable { onAction() },
            )
        }
    }
}
