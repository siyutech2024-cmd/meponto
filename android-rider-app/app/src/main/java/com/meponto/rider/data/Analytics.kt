package com.meponto.rider.data

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics

/**
 * GA4 wrapper (Firebase Analytics → the existing "MePonto" Android stream in
 * the descuai property). Sessions / active-user metrics are automatic once the
 * SDK is on the classpath; this object adds the few BUSINESS events worth
 * charting: check-ins, redemptions, shift signups, support tickets.
 *
 * Fail-safe: every call no-ops until [init] runs, and never throws — analytics
 * must never break a rider flow.
 */
object Analytics {
    @Volatile private var fa: FirebaseAnalytics? = null

    fun init(context: Context) {
        runCatching { fa = FirebaseAnalytics.getInstance(context.applicationContext) }
    }

    fun log(event: String, params: Map<String, String> = emptyMap()) {
        runCatching {
            val bundle = Bundle()
            params.forEach { (k, v) -> bundle.putString(k, v.take(100)) }
            fa?.logEvent(event, bundle)
        }
    }
}
