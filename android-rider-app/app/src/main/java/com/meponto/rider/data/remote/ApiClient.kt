package com.meponto.rider.data.remote

import android.content.Context
import com.meponto.rider.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

/** Builds the Retrofit-backed [ApiService] with a persistent cookie session. */
class ApiClient(context: Context) {

    val cookieJar = SessionCookieJar(context)

    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val httpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        // Idempotency-Key on every write so retries never double-apply.
        .addInterceptor { chain ->
            val req = chain.request()
            val out = if (req.method != "GET") {
                req.newBuilder()
                    .header("Idempotency-Key", java.util.UUID.randomUUID().toString())
                    .build()
            } else {
                req
            }
            chain.proceed(out)
        }
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
            }
        )
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    val service: ApiService = Retrofit.Builder()
        .baseUrl(BuildConfig.BASE_URL)
        .client(httpClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(ApiService::class.java)
}
