package com.meponto.rider.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
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
import com.meponto.rider.ui.components.OverlayTopBar
import com.meponto.rider.ui.components.Panel
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.components.SectionHeader
import com.meponto.rider.ui.theme.LocalMe

/**
 * 个人信息 / personal info — the rider views the backend-assigned identity
 * (ponto / leader / 99 ID, read-only) and completes payout details
 * (name / CPF / phone / PIX). CPF + PIX are required to receive payouts.
 */
@Composable
fun PersonalInfoScreen(onClose: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val store = LocalStore.current

    var name by remember { mutableStateOf(store.profile.name) }
    var cpf by remember { mutableStateOf(store.profile.cpf) }
    var phone by remember { mutableStateOf(store.profile.phone) }
    var pix by remember { mutableStateOf(store.profile.pix) }

    val canSave = name.isNotBlank() && cpf.isNotBlank() && phone.isNotBlank() && pix.isNotBlank()

    Column(Modifier.fillMaxSize().background(me.background)) {
        OverlayTopBar(title = loc.t("profile.personalInfo"), onClose = onClose)
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Completion warning when payout details are missing.
            if (!store.profile.isComplete) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(me.warning.copy(alpha = 0.12f))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = me.warning, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(10.dp))
                    Text(loc.t("profile.completePrompt"), color = me.text, fontSize = 12.sp)
                }
            }

            // Read-only assignment from the backend.
            Panel {
                InfoRow(loc.t("member.ponto"), store.profile.ponto)
                Box(Modifier.fillMaxWidth().height(1.dp).background(me.line))
                InfoRow(loc.t("member.leader"), store.profile.leader)
                Box(Modifier.fillMaxWidth().height(1.dp).background(me.line))
                InfoRow(loc.t("member.id99"), store.profile.ninetyNineId)
            }

            // Editable identity + payout fields.
            Panel {
                SectionHeader(loc.t("profile.payout"))
                Spacer(Modifier.size(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text(loc.t("auth.name")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = cpf, onValueChange = { cpf = it }, label = { Text(loc.t("profile.cpf")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text(loc.t("auth.phone")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = pix, onValueChange = { pix = it }, label = { Text(loc.t("profile.pix")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            }

            PrimaryButton(title = loc.t("profile.save"), icon = Icons.Filled.Check, enabled = canSave) {
                store.updateProfile(name, cpf, phone, pix)
                onClose()
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    val me = LocalMe.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = me.muted, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(value.ifBlank { "—" }, color = me.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}
