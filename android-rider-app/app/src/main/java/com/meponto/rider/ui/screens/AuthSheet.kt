package com.meponto.rider.ui.screens

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.meponto.rider.BuildConfig
import com.meponto.rider.R
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.components.PrimaryButton
import com.meponto.rider.ui.theme.LocalMe
import kotlinx.coroutines.launch

/** Launch Google sign-in via Credential Manager → returns the Google ID token. */
private suspend fun googleIdToken(context: Context): String? {
    val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
    if (clientId.isBlank()) return null
    return try {
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(clientId)
            .setFilterByAuthorizedAccounts(false)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val result = CredentialManager.create(context).getCredential(context, request)
        val cred = result.credential
        if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            GoogleIdTokenCredential.createFrom(cred.data).idToken
        } else {
            null
        }
    } catch (e: Exception) {
        null
    }
}

/**
 * Phone + OTP login sheet (mirrors the web /rider-login). Identity is anchored to
 * the rider record; phone is verified by code, and an unknown number can be
 * re-bound to an existing rider via CPF. Presented on demand for member actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthSheet(onDismiss: () -> Unit) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    val auth = LocalAuth.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var phone by remember { mutableStateOf("") }
    var cpf by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = me.background) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Image(painterResource(R.drawable.meponto_logo), contentDescription = "MePonto", modifier = Modifier.size(64.dp))
            Text(loc.t("auth.welcome"), color = me.text, fontWeight = FontWeight.Bold, fontSize = 18.sp)

            // Sign in with Google (hidden unless GOOGLE_WEB_CLIENT_ID is configured).
            if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank() && !auth.otpSent && !auth.needsCpf && !auth.working) {
                OutlinedButton(
                    onClick = { scope.launch { googleIdToken(context)?.let { auth.googleLogin(it) } } },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(loc.t("auth.google")) }
                if (auth.needsGoogleLink) {
                    Text(loc.t("auth.googleLink"), color = me.muted, fontSize = 12.sp, textAlign = TextAlign.Center)
                } else {
                    Text(loc.t("auth.or"), color = me.muted, fontSize = 11.sp)
                }
            }

            when {
                // ---- Step: enter the code ----
                auth.otpSent -> {
                    Text(
                        loc.t("auth.codeSent") + " · $phone",
                        color = me.muted, fontSize = 13.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = code, onValueChange = { code = it.filter { c -> c.isDigit() }.take(6) },
                        label = { Text(loc.t("auth.code")) }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                // ---- Step: confirm CPF to (re)bind the number ----
                auth.needsCpf -> {
                    Text(loc.t("auth.cpfPrompt"), color = me.muted, fontSize = 13.sp, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(
                        value = cpf, onValueChange = { cpf = it.filter { c -> c.isDigit() }.take(11) },
                        label = { Text(loc.t("auth.cpf")) }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                // ---- Step: enter the phone ----
                else -> {
                    OutlinedTextField(
                        value = phone, onValueChange = { phone = it },
                        label = { Text(loc.t("auth.phone")) }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            auth.errorKey?.let {
                Text(loc.t(it), color = me.danger, fontSize = 13.sp, modifier = Modifier.fillMaxWidth())
            }

            if (auth.working) {
                CircularProgressIndicator(color = me.accent)
            } else when {
                auth.otpSent -> {
                    PrimaryButton(title = loc.t("auth.login"), enabled = code.length >= 6) {
                        scope.launch { auth.verifyOtp(phone, code) }
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { code = ""; scope.launch { auth.requestOtp(phone, null) } }) {
                            Text(loc.t("auth.resend"), color = me.muted, fontSize = 12.sp)
                        }
                        TextButton(onClick = { code = ""; phone = ""; auth.resetOtp() }) {
                            Text(loc.t("auth.changeNumber"), color = me.muted, fontSize = 12.sp)
                        }
                    }
                }
                auth.needsCpf -> {
                    PrimaryButton(title = loc.t("auth.sendCode"), enabled = cpf.length == 11) {
                        scope.launch { auth.requestOtp(phone, cpf) }
                    }
                }
                else -> {
                    PrimaryButton(title = loc.t("auth.sendCode"), enabled = phone.filter { it.isDigit() }.length >= 10) {
                        scope.launch { auth.requestOtp(phone, null) }
                    }
                }
            }

            Text(loc.t("auth.enterCode"), color = me.muted, fontSize = 11.sp, textAlign = TextAlign.Center)
        }
    }
}
