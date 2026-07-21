package com.meponto.rider.ui.components

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.meponto.rider.i18n.LocalLoc
import com.meponto.rider.ui.theme.LocalMe
import com.meponto.rider.ui.theme.MeRadius
import com.meponto.rider.ui.theme.appBackground

/**
 * 统一风格弹框 / App-styled detail dialog — replaces Material's default
 * AlertDialog so message/notice popups match the app surface (me.surface +
 * hairline + accent title), instead of the flat white system dialog.
 */
@Composable
fun DetailDialog(
    title: String,
    body: String,
    meta: String? = null,
    onDismiss: () -> Unit,
) {
    val me = LocalMe.current
    val loc = LocalLoc.current
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeRadius.card))
                .background(me.surface)
                .border(1.dp, me.line, RoundedCornerShape(MeRadius.card))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, color = me.text, fontWeight = FontWeight.Black, fontSize = 18.sp)
            if (!meta.isNullOrBlank()) {
                Text(meta, color = me.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            Column(
                Modifier
                    .heightIn(max = 320.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                Text(body, color = me.textSoft, fontSize = 14.sp)
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeRadius.small))
                    .background(me.accent)
                    .clickable { onDismiss() }
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(loc.t("common.done"), color = me.accentInk, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}

/**
 * 分页清单 / Paged list section — long statements (现金账本 / 积分流水) show
 * [pageSize] rows at a time with a "载入更多" control, so the list never becomes
 * an endless wall. Uses take() rather than LazyColumn because it renders inside
 * a verticalScroll Screen (nested lazy lists crash). Style follows the app.
 */
@Composable
fun <T> PagedSection(
    items: List<T>,
    pageSize: Int = 8,
    modifier: Modifier = Modifier,
    row: @Composable (T) -> Unit,
) {
    val loc = LocalLoc.current
    val me = LocalMe.current
    var shown by remember(items) { mutableIntStateOf(pageSize) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items.take(shown).forEach { row(it) }
        if (shown < items.size) {
            val remaining = items.size - shown
            Text(
                "${loc.t("common.loadMore")} ($remaining)",
                color = me.accent,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeRadius.small))
                    .background(me.surfaceRaised)
                    .clickable { shown += pageSize }
                    .padding(vertical = 10.dp),
            )
        }
    }
}

/**
 * 下拉刷新页 / Screen with pull-to-refresh — same header + scroll layout as
 * [Screen], but a downward pull triggers [onRefresh] so freshly-approved
 * shifts (等) appear without relaunching the app.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshableScreen(
    title: String,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    val me = LocalMe.current
    val state = rememberPullToRefreshState()
    Column(Modifier.fillMaxSize().appBackground(me)) {
        Text(
            title,
            color = me.text,
            fontWeight = FontWeight.Black,
            fontSize = 32.sp,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 4.dp),
        )
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = onRefresh,
            state = state,
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                content = content,
            )
        }
    }
}
