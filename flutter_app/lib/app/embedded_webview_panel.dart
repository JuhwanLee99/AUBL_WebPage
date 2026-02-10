import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/config/app_config.dart';
import '../core/services/auth_bridge_service.dart';
import '../core/theme/app_theme.dart';
import '../core/webview/app_webview_screen.dart';
import '../core/webview/flutter_bridge_message.dart';

/// MainShell 내부에서 하단바를 유지한 채 표시되는 WebView 패널.
class EmbeddedWebViewPanel extends StatefulWidget {
  const EmbeddedWebViewPanel({
    super.key,
    required this.path,
    required this.title,
    required this.onClose,
  });

  final String path;
  final String title;
  final VoidCallback onClose;

  @override
  State<EmbeddedWebViewPanel> createState() => _EmbeddedWebViewPanelState();
}

class _EmbeddedWebViewPanelState extends State<EmbeddedWebViewPanel> {
  final AuthBridgeService _authBridgeService = AuthBridgeService();
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: const ['email']);
  late final WebViewController _controller;
  StreamSubscription<User?>? _authSub;
  String? _lastInjectedUid;
  static const String _webTokenProbeScript = '''
(async () => {
  try {
    const getter = window.__flutterGetIdToken;
    const bridge = window.FlutterBridge;
    if (!getter || !bridge) return;
    const token = await getter();
    if (token) {
      bridge.postMessage(JSON.stringify({ type: 'TOKEN_REFRESH', idToken: token }));
    }
  } catch (_) {}
})();
''';

  bool _loading = true;
  bool _authenticating = false;
  bool _googleSigningIn = false;
  String? _error;
  bool _loginBypassInFlight = false;
  String? _pendingLoginRedirect;

  bool _shouldIgnoreWebError(WebResourceError error) {
    final desc = error.description.toLowerCase();
    if (desc.contains('err_failed') || desc.contains('err_aborted')) {
      return _googleSigningIn || _loginBypassInFlight || _pendingLoginRedirect != null;
    }
    return false;
  }

  Uri get _pageUri => AppConfig.webUri(
        widget.path,
        queryParameters: const {
          'embedded': 'flutter',
          'nativeGoogle': '1',
        },
      );

  String get _pageUrl => _pageUri.toString();

  Uri _loginFallbackUri({String? nextPath}) {
    final query = <String, String>{
      'embedded': 'flutter',
      'nativeGoogle': '1',
    };
    final next = nextPath ?? widget.path;
    if (next.startsWith('/')) query['next'] = next;
    return AppConfig.webUri('/login', queryParameters: query);
  }

  bool _isGoogleOAuthRequest(Uri uri) {
    final host = uri.host.toLowerCase();
    if (host.contains('accounts.google.com') ||
        host.contains('oauth2.googleapis.com')) {
      return true;
    }
    final providerId = uri.queryParameters['providerId'];
    if (providerId == 'google.com' &&
        uri.path.contains('/__/auth/handler')) {
      return true;
    }
    return false;
  }

  /// 문자중계 경로에서 matchId 추출
  String? get _matchId {
    const prefix = '/scoreboard-text/';
    if (widget.path.startsWith(prefix)) {
      return widget.path.substring(prefix.length).split('/').first.split('?').first;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setBackgroundColor(AppTheme.slate900)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (msg) => _onBridgeMessage(msg.message),
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: _onNavigationRequest,
          onPageStarted: (_) {
            if (!mounted) return;
            setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() => _loading = false);
            unawaited(_injectAuthIfNeeded());
            unawaited(_requestWebIdTokenIfNeeded());
            if (_pendingLoginRedirect != null && !_loginBypassInFlight) {
              final redirect = _pendingLoginRedirect!;
              _pendingLoginRedirect = null;
              _loginBypassInFlight = true;
              unawaited(_injectAuthIfNeeded(redirectUrl: redirect).whenComplete(() {
                _loginBypassInFlight = false;
              }));
            }
          },
          onWebResourceError: (error) {
            if (_shouldIgnoreWebError(error)) return;
            if (!mounted) return;
            setState(() {
              _loading = false;
              _error = '웹 로딩 실패: ${error.description}';
            });
          },
        ),
      )
      ..loadRequest(_pageUri);

    final current = FirebaseAuth.instance.currentUser;
    if (current != null) {
      _lastInjectedUid = current.uid;
      unawaited(_injectAuthIfNeeded());
    }
    _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user == null) return;
      if (_lastInjectedUid == user.uid) return;
      _lastInjectedUid = user.uid;
      unawaited(_injectAuthIfNeeded());
    });
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _authBridgeService.dispose();
    super.dispose();
  }

  NavigationDecision _onNavigationRequest(NavigationRequest request) {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.navigate;

    if (_isGoogleOAuthRequest(uri)) {
      if (!_googleSigningIn) {
        unawaited(_signInWithNativeGoogle());
      }
      return NavigationDecision.prevent;
    }

    final webHost = Uri.parse(AppConfig.webBaseUrl).host;
    final isSameHost = uri.host.isEmpty || uri.host == webHost;
    if (isSameHost && uri.path == '/login') {
      final alreadyEmbedded = uri.queryParameters['embedded'] == 'flutter';
      final nativeGoogleEnabled = uri.queryParameters['nativeGoogle'] == '1';
      if (!alreadyEmbedded || !nativeGoogleEnabled) {
        _controller.loadRequest(
          _loginFallbackUri(nextPath: uri.queryParameters['next']),
        );
        return NavigationDecision.prevent;
      }
      final user = FirebaseAuth.instance.currentUser;
      if (user != null) {
        final next = uri.queryParameters['next'] ?? widget.path;
        _pendingLoginRedirect = AppConfig.webUri(
          next,
          queryParameters: const {
            'embedded': 'flutter',
            'nativeGoogle': '1',
          },
        ).toString();
      }
    }

    return NavigationDecision.navigate;
  }

  Future<void> _onBridgeMessage(String raw) async {
    final payload = FlutterBridgeMessage.fromRaw(raw);
    switch (payload.type) {
      case BridgeMessageType.loginSuccess:
      case BridgeMessageType.tokenRefresh:
        final idToken = payload.idToken;
        if (idToken != null && idToken.isNotEmpty) {
          await _signInWithCustomToken(idToken);
        }
        return;
      case BridgeMessageType.logout:
        try {
          await GoogleSignIn().signOut();
        } catch (_) {}
        await FirebaseAuth.instance.signOut();
        return;
      case BridgeMessageType.requestNativeGoogle:
        await _signInWithNativeGoogle();
        return;
      case BridgeMessageType.unknown:
        return;
    }
  }

  /// Flutter 로그인 상태를 WebView에 주입
  Future<void> _injectAuthIfNeeded({String? redirectUrl}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    try {
      final idToken = await user.getIdToken(true);
      if (idToken == null || idToken.isEmpty) return;
      final customToken =
          await _authBridgeService.exchangeWebIdToken(idToken);
      final escaped = customToken.replaceAll(r'\', r'\\').replaceAll("'", r"\'");
      final escapedRedirect =
          redirectUrl?.replaceAll(r'\', r'\\').replaceAll("'", r"\'");
      await _controller.runJavaScript('''
(function() {
  const token = '$escaped';
  const redirect = ${escapedRedirect == null ? 'null' : "'$escapedRedirect'"};
  const inject = () => {
    if (window.__flutterAuthInject) {
      const result = window.__flutterAuthInject(token);
      if (redirect) {
        Promise.resolve(result)
          .then(() => window.location.replace(redirect))
          .catch(() => {});
      }
      return true;
    }
    return false;
  };
  if (inject()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (inject() || tries >= 20) {
      clearInterval(timer);
    }
  }, 300);
})();
''');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '인증 주입 실패: $e';
      });
    }
  }

  Future<void> _requestWebIdTokenIfNeeded() async {
    if (FirebaseAuth.instance.currentUser != null) return;
    try {
      await _controller.runJavaScript(_webTokenProbeScript);
    } catch (_) {
      // 토큰 조회 실패 시 무시
    }
  }

  Future<void> _signInWithCustomToken(String webIdToken) async {
    if (_authenticating) return;
    setState(() {
      _authenticating = true;
      _error = null;
    });
    try {
      final customToken =
          await _authBridgeService.exchangeWebIdToken(webIdToken);
      await FirebaseAuth.instance.signInWithCustomToken(customToken);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '로그인 동기화 실패: $e');
    } finally {
      if (mounted) setState(() => _authenticating = false);
    }
  }

  Future<void> _signInWithNativeGoogle() async {
    if (_googleSigningIn || _authenticating) return;
    if (FirebaseAuth.instance.currentUser != null) {
      unawaited(_injectAuthIfNeeded(redirectUrl: _pageUrl));
      return;
    }
    setState(() {
      _googleSigningIn = true;
      _error = null;
    });
    try {
      final account = await _googleSignIn.signIn();
      if (account == null) return;
      final authData = await account.authentication;
      final idToken = authData.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw Exception('Google idToken이 없습니다.');
      }
      final credential = GoogleAuthProvider.credential(
        idToken: idToken,
        accessToken: authData.accessToken,
      );
      await FirebaseAuth.instance.signInWithCredential(credential);
      unawaited(_injectAuthIfNeeded(redirectUrl: _pageUrl));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Google 로그인 실패: $e');
    } finally {
      if (mounted) setState(() => _googleSigningIn = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final matchId = _matchId;

    return Column(
      children: [
        // 헤더 바
        Container(
          color: AppTheme.slate900,
          padding: EdgeInsets.only(
            top: MediaQuery.of(context).padding.top,
          ),
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white),
                onPressed: widget.onClose,
              ),
              Expanded(
                child: Text(
                  widget.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        // WebView
        Expanded(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_loading || _authenticating || _googleSigningIn)
                const Center(child: CircularProgressIndicator()),
              if (_error != null)
                Align(
                  alignment: Alignment.bottomCenter,
                  child: Container(
                    width: double.infinity,
                    margin: const EdgeInsets.all(12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade700,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(_error!,
                              style: const TextStyle(color: Colors.white)),
                        ),
                        GestureDetector(
                          onTap: () => setState(() => _error = null),
                          child: const Icon(Icons.close,
                              color: Colors.white, size: 18),
                        ),
                      ],
                    ),
                  ),
                ),
              // 문자중계일 때 라이브 오버레이 FAB
              if (matchId != null)
                Positioned(
                  right: 16,
                  bottom: 16,
                  child: FloatingActionButton.extended(
                    onPressed: () {
                      Navigator.of(context).push(MaterialPageRoute<void>(
                        builder: (_) => AppWebViewScreen(
                          path: '/live-overlay/$matchId',
                          title: '라이브 오버레이',
                        ),
                      ));
                    },
                    backgroundColor: AppTheme.red500,
                    icon: const Icon(Icons.live_tv, color: Colors.white),
                    label: const Text('라이브',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600)),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
