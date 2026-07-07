package com.meponto.rider.ui.screens

import android.content.Context
import android.util.Log
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import com.meponto.rider.ui.theme.MeRadius
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
        // Typical causes: no Google Play services on the device/emulator, or the
        // OAuth project is missing an ANDROID client (package name + SHA-1).
        Log.w("MePontoAuth", "Google sign-in failed", e)
        null
    }
}

/** Filled rounded text field — the sheet's standard input style. */
@Composable
private fun AuthField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    val me = LocalMe.current
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = me.surfaceRaised,
            unfocusedContainerColor = me.surfaceRaised,
            focusedBorderColor = me.accent,
            unfocusedBorderColor = androidx.compose.ui.graphics.Color.Transparent,
            focusedLabelColor = me.muted,
            unfocusedLabelColor = me.muted,
            cursorColor = me.accent,
            focusedTextColor = me.text,
            unfocusedTextColor = me.text,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
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
    var signupName by remember { mutableStateOf("") }
    var signupBirthday by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = me.background) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Image(painterResource(R.drawable.meponto_logo), contentDescription = "MePonto", modifier = Modifier.size(56.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(loc.t("auth.welcome"), color = me.text, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Text(loc.t("auth.guestPrompt"), color = me.muted, fontSize = 13.sp, textAlign = TextAlign.Center)
            }

            // Sign in with Google (hidden unless GOOGLE_WEB_CLIENT_ID is configured).
            if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank() && !auth.otpSent && !auth.needsCpf && !auth.working) {
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            val token = googleIdToken(context)
                            if (token != null) auth.googleLogin(token) else auth.reportGoogleUnavailable()
                        }
                    },
                    shape = RoundedCornerShape(MeRadius.card),
                    border = BorderStroke(1.dp, me.line),
                    contentPadding = PaddingValues(vertical = 13.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(loc.t("auth.google"), color = me.text, fontWeight = FontWeight.SemiBold) }
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
                    AuthField(code, { code = it.filter { c -> c.isDigit() }.take(6) }, loc.t("auth.code"), KeyboardType.NumberPassword)
                }
                // ---- Step: unknown phone → link an existing record via CPF,
                // or create a brand-new account (phone-first signup, mirrors
                // the web /register: the member is only created on verify). ----
                auth.needsCpf -> {
                    Text(loc.t("auth.cpfPrompt"), color = me.muted, fontSize = 13.sp, modifier = Modifier.fillMaxWidth())
                    AuthField(cpf, { cpf = it.filter { c -> c.isDigit() }.take(11) }, loc.t("auth.cpf"), KeyboardType.Number)
                    Text(loc.t("auth.signupPrompt"), color = me.muted, fontSize = 12.sp, modifier = Modifier.fillMaxWidth())
                    AuthField(signupName, { signupName = it.take(60) }, loc.t("auth.name"))
                    AuthField(signupBirthday, { signupBirthday = it.filter { c -> c.isDigit() || c == '-' }.take(10) }, loc.t("auth.birthday"), KeyboardType.Number)
                }
                // ---- Step: enter the phone ----
                else -> {
                    AuthField(phone, { phone = it }, loc.t("auth.phone"), KeyboardType.Phone)
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
                    // Either path ends in the same SMS challenge: CPF re-binds
                    // an existing record; a name creates the account on verify.
                    PrimaryButton(title = loc.t("auth.sendCode"), enabled = cpf.length == 11 || signupName.isNotBlank()) {
                        scope.launch {
                            if (cpf.length == 11) auth.requestOtp(phone, cpf)
                            else auth.requestOtp(phone, null, signupName, signupBirthday)
                        }
                    }
                }
                else -> {
                    PrimaryButton(title = loc.t("auth.sendCode"), enabled = phone.filter { it.isDigit() }.length >= 10) {
                        scope.launch { auth.requestOtp(phone, null) }
                    }
                }
            }

        }
    }
}
