import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/app_config.dart';
import '../services/auth_bridge_service.dart';
import '../theme/app_theme.dart';
import 'flutter_bridge_message.dart';

/// 범용 WebView 래퍼.
/// 스코어보드, 관리자 페이지 등 WebView가 필요한 화면에서 공통 사용.
class AppWebViewScreen extends StatefulWidget {
  const AppWebViewScreen({
    super.key,
    required this.path,
    required this.title,
  });

  /// 웹 앱 경로 (e.g. '/scorekeeper', '/admin')
  final String path;

  /// AppBar 타이틀
  final String title;

  @override
  State<AppWebViewScreen> createState() => _AppWebViewScreenState();
}

class _AppWebViewScreenState extends State<AppWebViewScreen> {
  final AuthBridgeService _authBridgeService = AuthBridgeService();
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: const ['email']);
  late final WebViewController _controller;

  bool _loading = true;
  bool _authenticating = false;
  bool _googleSigningIn = false;
  String? _error;

  void _applySystemUiChrome() {
    unawaited(SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.manual,
      overlays: SystemUiOverlay.values,
    ));
    SystemChrome.setSystemUIOverlayStyle(AppTheme.systemUiStyle);
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

  Uri get _pageUri =>
      AppConfig.webUri(widget.path, queryParameters: const {'embedded': 'flutter'});

  Uri _loginFallbackUri({String? nextPath}) {
    final query = <String, String>{
      'embedded': 'flutter',
      'nativeGoogle': '1',
    };
    final next = nextPath ?? widget.path;
    if (next.startsWith('/')) query['next'] = next;
    return AppConfig.webUri('/login', queryParameters: query);
  }

  @override
  void initState() {
    super.initState();
    _applySystemUiChrome();

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
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() => _loading = true);
          },
          onPageFinished: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() => _loading = false);
          },
          onWebResourceError: (error) {
            if (!mounted) return;
            setState(() {
              _loading = false;
              _error = '웹 로딩 실패: ${error.description}';
            });
          },
        ),
      )
      ..loadRequest(_pageUri);
  }

  @override
  void dispose() {
    _authBridgeService.dispose();
    super.dispose();
  }

  NavigationDecision _onNavigationRequest(NavigationRequest request) {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.navigate;

    // Google OAuth → native sign-in
    if (_isGoogleOAuthRequest(uri)) {
      if (!_googleSigningIn) {
        unawaited(_signInWithNativeGoogle());
      }
      return NavigationDecision.prevent;
    }

    // Login redirect → add embedded params
    final webHost = Uri.parse(AppConfig.webBaseUrl).host;
    final isSameHost = uri.host.isEmpty || uri.host == webHost;
    if (isSameHost && uri.path == '/login') {
      final alreadyEmbedded = uri.queryParameters['embedded'] == 'flutter';
      if (!alreadyEmbedded) {
        _controller.loadRequest(
          _loginFallbackUri(nextPath: uri.queryParameters['next']),
        );
        return NavigationDecision.prevent;
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
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Google 로그인 실패: $e');
    } finally {
      if (mounted) setState(() => _googleSigningIn = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Stack(
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
                      child: Text(
                        _error!,
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                    GestureDetector(
                      onTap: () => setState(() => _error = null),
                      child:
                          const Icon(Icons.close, color: Colors.white, size: 18),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
