package com.meponto.rider.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Birthday input backed by a calendar dialog (no free typing). The value is
 * always a canonical `YYYY-MM-DD` string — the format the backend validates.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BirthdayField(
    value: String,
    label: String,
    hint: String? = null,
    onChange: (String) -> Unit,
) {
    var showPicker by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            enabled = false,
            label = { Text(label) },
            placeholder = { Text("1995-07-20") },
            supportingText = hint?.let { { Text(it) } },
            trailingIcon = { Icon(Icons.Filled.CalendarMonth, contentDescription = null) },
            singleLine = true,
            colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                // Keep the disabled (tap-to-open) field looking like an active one.
                disabledTextColor = androidx.compose.material3.MaterialTheme.colorScheme.onSurface,
                disabledBorderColor = androidx.compose.material3.MaterialTheme.colorScheme.outline,
                disabledLabelColor = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
                disabledTrailingIconColor = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
                disabledSupportingTextColor = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
                disabledPlaceholderColor = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        // Disabled fields swallow no input — this transparent overlay opens the calendar.
        Box(modifier = Modifier.matchParentSize().clickable { showPicker = true })
    }

    if (showPicker) {
        val utcFmt = remember {
            SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        }
        val initialMillis = remember(value) {
            runCatching { utcFmt.parse(value)?.time }.getOrNull()
        }
        val state = rememberDatePickerState(
            initialSelectedDateMillis = initialMillis,
            yearRange = 1940..Calendar.getInstance().get(Calendar.YEAR),
        )
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onChange(utcFmt.format(Date(it))) }
                    showPicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) { Text("✕") }
            },
        ) {
            DatePicker(state = state, showModeToggle = false)
        }
    }
}
