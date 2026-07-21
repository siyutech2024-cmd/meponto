package com.meponto.rider.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File

/**
 * On-device rider avatar (照片头像) — the photo lives only on the phone, keyed
 * per user so a shared device never leaks a previous rider's face.
 *
 * SHARED loader so the Member Card AND the Home header show the SAME photo
 * (field report 2026-07-21: avatar missing on both). It also self-heals the
 * key-drift bug: when a photo was saved before the profile fully hydrated
 * (ninetyNineId still blank → key "phone"/"guest") and the id arrived later,
 * the primary lookup missed and the avatar "vanished". Loading now tries every
 * candidate key, so a photo saved under any of them still appears.
 */
object AvatarStore {
    private const val PREFIX = "member_avatar"

    private fun clean(v: String) = v.filter { it.isLetterOrDigit() }

    /** Preferred key for SAVING a new photo (most stable id first). */
    fun keyFor(profile: MembershipProfile): String =
        clean(profile.ninetyNineId).ifBlank { clean(profile.phone) }.ifBlank { "guest" }

    /** All keys a photo for this rider could have been stored under. */
    private fun candidateKeys(profile: MembershipProfile): List<String> =
        listOf(clean(profile.ninetyNineId), clean(profile.phone), "guest")
            .filter { it.isNotBlank() }
            .distinct()

    fun file(context: Context, key: String): File = File(context.filesDir, "${PREFIX}_$key.jpg")

    /** The avatar file that actually exists for this rider (or null). */
    fun existingFile(context: Context, profile: MembershipProfile): File? =
        candidateKeys(profile).map { file(context, it) }.firstOrNull { it.exists() }

    /** Decode the rider's avatar from whichever candidate file exists. */
    fun load(context: Context, profile: MembershipProfile): Bitmap? =
        existingFile(context, profile)?.let { f ->
            runCatching { BitmapFactory.decodeFile(f.absolutePath) }.getOrNull()
        }
}
