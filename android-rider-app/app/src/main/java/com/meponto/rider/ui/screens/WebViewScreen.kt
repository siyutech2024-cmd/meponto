package com.meponto.rider.ui.screens

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.meponto.rider.data.remote.ApiClient
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * A5 · 活动 WebView 容器(会话注入).
 *
 * 三条硬性验收标准(方案 v2 §4 A5,缺一不可):
 *  ① **URL 白名单**:只有 `*.meponto.com` 在 APP 内打开;其他域名一律交给系统
 *     浏览器。这条既拦外链钓鱼,也保证会话 cookie 永远不会跟着请求跑到第三方
 *     站点上去 —— 白名单和 cookie 注入是同一个安全边界的两半,分开做没有意义。
 *  ② **CookieManager 注入,域固定 `.meponto.com`**:把 OkHttp 已持有的会话
 *     cookie 复制给 WebView,H5 打开即是登录态。域写死,不跟随 URL —— 否则
 *     一个 open redirect 就能把会话送出去。
 *  ③ **活动 H5 自带 CSP**:服务端责任,在此记录以便验收时一起核对。
 *
 * 另外:JavaScript 开着(H5 活动页需要),但 `allowFileAccess` /
 * `allowContentAccess` 全部关掉 —— 远端页面没有任何理由碰本地文件。
 */
object WebLinks {
    /** ① 白名单:meponto.com 及其子域,且必须是 https。 */
    fun isInternal(url: String): Boolean {
        val parsed = url.toHttpUrlOrNull() ?: return false
        if (parsed.scheme != "https") return false
        val host = parsed.host.lowercase()
        return host == "meponto.com" || host.endsWith(".meponto.com")
    }

    /** 外链走系统浏览器;失败就静默放弃(绝不在 APP 内兜底打开)。 */
    fun openExternally(context: android.content.Context, url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}

/**
 * ② 把当前会话 cookie 注入 WebView。域固定 `.meponto.com`,不接受调用方传域。
 * 幂等,可以每次打开都调。
 */
private fun injectSession(context: android.content.Context) {
    runCatching {
        val manager = CookieManager.getInstance()
        manager.setAcceptCookie(true)
        val jarUrl = "https://mall.meponto.com/".toHttpUrlOrNull() ?: return
        for (cookie in ApiClient(context).cookieJar.loadForRequest(jarUrl)) {
            // 注意:Domain 写死,不用 cookie.domain —— 服务端若哪天下发了别的域,
            // 也不能让它决定我们把会话发给谁。
            manager.setCookie(
                "https://meponto.com",
                "${cookie.name}=${cookie.value}; Domain=.meponto.com; Path=/; Secure; SameSite=Lax",
            )
        }
        manager.flush()
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewScreen(url: String, title: String, onClose: () -> Unit) {
    val context = LocalContext.current
    var webView by remember { mutableStateOf<WebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(url) { injectSession(context) }

    // 系统返回键优先在 H5 内后退,退到头才关闭容器。
    BackHandler(enabled = true) {
        val view = webView
        if (canGoBack && view != null) view.goBack() else onClose()
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose) { Icon(Icons.Filled.Close, contentDescription = "Fechar") }
            Text(
                title.ifBlank { "MePonto" },
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Black,
                modifier = Modifier.weight(1f),
            )
        }
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())

        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    settings.javaScriptEnabled = true // 活动 H5 需要
                    settings.domStorageEnabled = true
                    // 远端页面没有任何理由碰本地文件。
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.setSupportMultipleWindows(false)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val target = request?.url?.toString() ?: return false
                            // ① 白名单:站外一律交给系统浏览器,WebView 不加载。
                            if (!WebLinks.isInternal(target)) {
                                WebLinks.openExternally(ctx, target)
                                return true
                            }
                            return false
                        }

                        override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                            loading = false
                            canGoBack = view?.canGoBack() == true
                        }
                    }
                    webView = this
                    if (WebLinks.isInternal(url)) loadUrl(url) else WebLinks.openExternally(ctx, url)
                }
            },
        )
    }
}
