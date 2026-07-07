package com.meponto.rider.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhonelinkLock
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meponto.rider.LocalAppearance
import com.meponto.rider.LocalLogout
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalSplash
import com.meponto.rider.data.LocalStore
import com.meponto.rider.i18n.AppLanguage
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.OverlayTopBar
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.SectionHeader
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.appBackground
import com.meponto.rider.ui.theme.MeRadius

@Composable
fun ProfileScreen(onClose: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current
    val appearance = LocalAppearance.current
    val splash = LocalSplash.current
    val auth = LocalAuth.current
    val logout = LocalLogout.current
    var showSupport by remember { mutableStateOf(false) }
    var showPersonalInfo by remember { mutableStateOf(false) }

    if (showSupport) {
        Column(Modifier.fillMaxSize().appBackground(me)) {
            OverlayTopBar(title = loc.t("support.title"), onClose = { showSupport = false })
            SupportScreen()
        }
        return
    }
    if (showPersonalInfo) {
        PersonalInfoScreen(onClose = { showPersonalInfo = false })
        return
    }

    Column(Modifier.fillMaxSize().appBackground(me)) {
        OverlayTopBar(title = loc.t("profile.title"), onClose = onClose)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header — member avatar, or guest CTA opening the auth sheet.
            if (auth.isMember) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(56.dp).clip(CircleShape).background(me.text),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(store.riderName.take(1).uppercase(), color = me.accent, fontWeight = FontWeight.Black, fontSize = 22.sp)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(store.riderName, color = me.text, fontWeight = FontWeight.Black, fontSize = 20.sp)
                        Text("${store.pointsBalance} pts · ${loc.t("home.rider")}", color = me.muted, fontSize = 14.sp)
                    }
                }

                // Google-only session: verify the phone here to unlock
                // wallet / points / shifts (backend keeps them locked).
                if (auth.phoneUnverified) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(MeRadius.card))
                            .background(me.warning.copy(alpha = 0.14f))
                            .clickable { auth.presentAuth() }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.PhonelinkLock, contentDescription = null, tint = me.warning)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(loc.t("profile.verifyPhone"), color = me.text, fontWeight = FontWeight.SemiBold)
                            Text(loc.t("profile.verifyPhoneHint"), color = me.muted, fontSize = 11.sp)
                        }
                        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = me.muted)
                    }
                }

                // Personal info (name / CPF / phone / PIX) — member only.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(MeRadius.card))
                        .background(me.surface)
                        .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
                        .clickable { showPersonalInfo = true }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Badge, contentDescription = null, tint = me.accent)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(loc.t("profile.personalInfo"), color = me.text, fontWeight = FontWeight.SemiBold)
                        if (!store.profile.isComplete) {
                            Text(loc.t("profile.completePrompt"), color = me.warning, fontSize = 11.sp)
                        }
                    }
                    if (!store.profile.isComplete) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(me.warning))
                        Spacer(Modifier.width(8.dp))
                    }
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = me.muted)
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { auth.presentAuth() },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(56.dp).clip(CircleShape).background(me.accent),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Person, contentDescription = null, tint = me.accentInk)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(loc.t("profile.guest"), color = me.text, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("${loc.t("auth.login")} / ${loc.t("auth.register")}", color = me.accent, fontSize = 14.sp)
                    }
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = me.muted)
                }
            }

            // Conquistas — lifetime-order achievement badges.
            if (auth.isMember && store.badges.isNotEmpty()) {
                Panel {
                    SectionHeader(loc.t("profile.badges"))
                    Spacer(Modifier.size(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        store.badges.chunked(3).forEach { rowBadges ->
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                rowBadges.forEach { b ->
                                    Column(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(MeRadius.small))
                                            .background(if (b.achieved) me.accent.copy(alpha = 0.18f) else me.surfaceRaised)
                                            .padding(vertical = 12.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Text(b.icon, fontSize = 22.sp, modifier = Modifier.alpha(if (b.achieved) 1f else 0.35f))
                                        Text(
                                            b.label,
                                            color = if (b.achieved) me.text else me.muted,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 10.sp,
                                            maxLines = 1,
                                        )
                                    }
                                }
                                repeat(3 - rowBadges.size) { Spacer(Modifier.weight(1f)) }
                            }
                        }
                    }
                }
            }

            // Language
            Panel {
                SectionHeader(loc.t("profile.language"))
                Spacer(Modifier.size(8.dp))
                AppLanguage.entries.forEach { lang ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { loc.updateLanguage(lang) }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(lang.flag, fontSize = 18.sp)
                        Spacer(Modifier.width(10.dp))
                        Text(lang.nativeName, color = me.text, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        if (loc.language == lang) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = me.accent)
                        }
                    }
                }
            }

            // Appearance
            Panel {
                SectionHeader(loc.t("profile.appearance"))
                Spacer(Modifier.size(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppearanceChip("system", loc.t("profile.system"), appearance.mode == "system", Modifier.weight(1f)) { appearance.set("system") }
                    AppearanceChip("dark", loc.t("profile.dark"), appearance.mode == "dark", Modifier.weight(1f)) { appearance.set("dark") }
                    AppearanceChip("light", loc.t("profile.light"), appearance.mode == "light", Modifier.weight(1f)) { appearance.set("light") }
                }
            }

            // 启动页(后台设置) — local preview of backend-managed splash
            Panel {
                SectionHeader(loc.t("admin.splash"))
                Spacer(Modifier.size(8.dp))
                val cfg = splash.config
                val durSec = (cfg.durationMs / 1000).coerceAtLeast(1)

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(loc.t("admin.splashEnabled"), color = me.textSoft, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Switch(
                        checked = cfg.enabled,
                        onCheckedChange = { splash.update(cfg.copy(enabled = it)) },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = me.accentInk,
                            checkedTrackColor = me.accent,
                        ),
                    )
                }
                Spacer(Modifier.size(8.dp))
                OutlinedTextField(
                    value = cfg.tagline,
                    onValueChange = { splash.update(cfg.copy(tagline = it)) },
                    label = { Text(loc.t("admin.splashTagline")) },
                    placeholder = { Text(loc.t("splash.tagline")) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.size(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${loc.t("admin.splashDuration")}: $durSec", color = me.textSoft, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Icon(
                        Icons.Filled.Remove, contentDescription = "-", tint = me.text,
                        modifier = Modifier
                            .clip(CircleShape).background(me.surfaceRaised)
                            .clickable(enabled = durSec > 1) { splash.update(cfg.copy(durationMs = (durSec - 1) * 1000)) }
                            .padding(6.dp),
                    )
                    Spacer(Modifier.size(12.dp))
                    Icon(
                        Icons.Filled.Add, contentDescription = "+", tint = me.text,
                        modifier = Modifier
                            .clip(CircleShape).background(me.surfaceRaised)
                            .clickable(enabled = durSec < 6) { splash.update(cfg.copy(durationMs = (durSec + 1) * 1000)) }
                            .padding(6.dp),
                    )
                }
                Spacer(Modifier.size(8.dp))
                Text(loc.t("admin.splashNote"), color = me.muted, fontSize = 11.sp)
                Spacer(Modifier.size(8.dp))
                Text(
                    loc.t("admin.resetBackend"),
                    color = me.accent,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    modifier = Modifier.clickable { splash.resetToDefault() },
                )
            }

            // Support link
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeRadius.card))
                    .background(me.surface)
                    .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
                    .clickable { showSupport = true }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.SupportAgent, contentDescription = null, tint = me.text)
                Spacer(Modifier.width(10.dp))
                Text(loc.t("support.title"), color = me.text, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = me.text)
            }

            // Logout — member only.
            if (auth.isMember) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(MeRadius.card))
                        .border(1.dp, me.danger.copy(alpha = 0.4f), RoundedCornerShape(MeRadius.card))
                        .clickable { logout() }
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(loc.t("profile.logout"), color = me.danger, fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(Modifier.size(8.dp))
        }
    }
}

@Composable
private fun AppearanceChip(
    key: String,
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val me = LocalMe.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(MeRadius.small))
            .background(if (selected) me.text else me.surfaceRaised)
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (selected) me.accent else me.textSoft,
            fontWeight = FontWeight.Black,
            fontSize = 13.sp,
        )
    }
}
