package com.meponto.rider

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.launch
import com.meponto.rider.data.AppStore
import com.meponto.rider.data.AuthController
import com.meponto.rider.data.LocalAuth
import com.meponto.rider.data.LocalRepo
import com.meponto.rider.data.LocalSession
import com.meponto.rider.data.LocalSplash
import com.meponto.rider.data.LocalStore
import com.meponto.rider.data.RiderRepository
import com.meponto.rider.data.SessionManager
import com.meponto.rider.data.SplashController
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.i18n.LocalizationManager
import com.meponto.rider.ui.RootScaffold
import com.meponto.rider.ui.screens.AuthSheet
import com.meponto.rider.ui.screens.SplashScreen
import com.meponto.rider.ui.theme.MePontoTheme
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MePontoRiderApp() }
    }
}

/** Controls the appearance mode (system | dark | light), persisted in prefs. */
class AppearanceController(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("meponto_rider", Context.MODE_PRIVATE)

    var mode by mutableStateOf(prefs.getString("appearance", "system") ?: "system")
        private set

    fun set(value: String) {
        mode = value
        prefs.edit().putString("appearance", value).apply()
    }
}

val LocalAppearance = staticCompositionLocalOf<AppearanceController> {
    error("AppearanceController not provided")
}

/** Logs the rider out (returns to guest). */
val LocalLogout = staticCompositionLocalOf<() -> Unit> { {} }

@Composable
fun MePontoRiderApp() {
    val context = LocalContext.current
    val store = remember { AppStore() }
    val loc = remember { LocalizationManager(context) }
    val appearance = remember { AppearanceController(context) }
    val splash = remember { SplashController(context) }
    val session = remember { SessionManager(context) }
    val repo = remember { RiderRepository(context) }
    remember(store, repo) { store.attach(repo) } // route store mutations → backend writes
    val auth = remember { AuthController(session, repo) }
    val scope = rememberCoroutineScope()

    // Ask for notification permission (Android 13+) once on launch.
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        // Log the FCM token (tag MePontoFCM) so you can paste it into Firebase
        // Console → Cloud Messaging → "Send test message" to test push directly.
        FirebaseMessaging.getInstance().token.addOnSuccessListener { Log.d("MePontoFCM", "startup token=$it") }
    }

    var showSplash by remember { mutableStateOf(splash.config.enabled) }
    LaunchedEffect(Unit) { splash.refresh() } // best-effort pull for the next launch
    LaunchedEffect(Unit) {
        if (!splash.config.enabled) {
            showSplash = false
        } else {
            delay((splash.config.durationSeconds * 1000).toLong())
            showSplash = false
        }
    }
    // Hydrate from the PontoSys API whenever the user is (or becomes) a member,
    // and register this device's FCM push token.
    LaunchedEffect(auth.state) {
        if (auth.isMember) {
            session.memberName?.let { name ->
                runCatching { store.apply(repo.loadSnapshot(name)) }
                FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                    Log.d("MePontoFCM", "token=$token")
                    scope.launch { repo.registerPushToken(name, token) }
                }
            }
        }
    }

    val systemDark = isSystemInDarkTheme()
    val dark = when (appearance.mode) {
        "dark" -> true
        "light" -> false
        else -> systemDark
    }

    val logout: () -> Unit = { auth.logout() }

    CompositionLocalProvider(
        LocalStore provides store,
        LocalLoc provides loc,
        LocalAppearance provides appearance,
        LocalSplash provides splash,
        LocalSession provides session,
        LocalRepo provides repo,
        LocalAuth provides auth,
        LocalLogout provides logout,
    ) {
        MePontoTheme(darkTheme = dark) {
            Box(Modifier.fillMaxSize()) {
                // Deferred login: everyone enters as guest; member actions open the sheet.
                RootScaffold()
                if (showSplash && splash.config.enabled) {
                    SplashScreen(splash.config)
                }
                if (auth.presentingAuth) {
                    AuthSheet(onDismiss = { auth.dismissAuth() })
                }
            }
        }
    }
}
