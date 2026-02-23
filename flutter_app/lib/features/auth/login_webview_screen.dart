import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/config/app_config.dart';
import '../../core/contracts/flutter_bridge_contract.dart';
import '../../core/contracts/web_contracts.dart';
import '../../core/services/auth_bridge_service.dart';
import '../../core/webview/auth_sync/webview_auth_scripts.dart';
import '../../core/webview/auth_sync/webview_auth_sync_controller.dart';
import '../../core/webview/auth_sync/webview_auth_sync_state.dart';

class LoginWebViewScreen extends StatefulWidget {
  const LoginWebViewScreen({
    super.key,
    this.nextPath,
  });

  final String? nextPath;

  @override
  State<LoginWebViewScreen> createState() => _LoginWebViewScreenState();
}

class _LoginWebViewScreenState extends State<LoginWebViewScreen>
    with WidgetsBindingObserver {
  static const Color _chromeColor = Color(0xFF0F172A);
  static const SystemUiOverlayStyle _overlayStyle = SystemUiOverlayStyle(
    statusBarColor: _chromeColor,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: _chromeColor,
    systemNavigationBarIconBrightness: Brightness.light,
    systemNavigationBarDividerColor: _chromeColor,
  );
  final AuthBridgeService _authBridgeService = AuthBridgeService();
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: const ['email']);
  late final WebViewController _controller;
  StreamSubscription<User?>? _authSub;
  bool _loginCompleted = false;
  final WebViewAuthSyncState _authSyncState = WebViewAuthSyncState();

  bool _pageLoading = true;
  bool _authenticating = false;
  bool _googleSigningIn = false;
  String? _error;

  void _applySystemUiChrome() {
    unawaited(SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.manual,
      overlays: SystemUiOverlay.values,
    ));
    SystemChrome.setSystemUIOverlayStyle(_overlayStyle);
  }

  void _finishLogin() {
    if (_loginCompleted) return;
    _loginCompleted = true;
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  bool _isGoogleOAuthRequest(Uri uri) {
    final host = uri.host.toLowerCase();
    final isGoogleHost = host.contains('accounts.google.com') ||
        host.contains('oauth2.googleapis.com');
    if (isGoogleHost) return true;

    // Firebase Auth redirect handler for Google provider.
    final providerId = uri.queryParameters['providerId'];
    if (providerId == 'google.com' && uri.path.contains('/__/auth/handler')) {
      return true;
    }

    return false;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _applySystemUiChrome();

    if (FirebaseAuth.instance.currentUser != null) {
      // 이미 로그인 상태면 바로 닫기
      WidgetsBinding.instance.addPostFrameCallback((_) => _finishLogin());
    } else {
      _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
        if (user != null) _finishLogin();
      });
    }

    _controller = WebViewController()
      ..setBackgroundColor(_chromeColor)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        FlutterBridgeContracts.channelName,
        onMessageReceived: (message) {
          _onBridgeMessage(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri != null && _isGoogleOAuthRequest(uri)) {
              if (!_googleSigningIn) {
                unawaited(_signInWithNativeGoogle());
              }
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onPageStarted: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() {
              _pageLoading = true;
            });
          },
          onPageFinished: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() {
              _pageLoading = false;
            });
            unawaited(_requestWebIdTokenIfNeeded());
          },
          onWebResourceError: (error) {
            if (!mounted) return;
            setState(() {
              _pageLoading = false;
              _error = '웹 로딩 실패: ${error.description}';
            });
          },
        ),
      )
      ..loadRequest(_loginUri());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _authSub?.cancel();
    _authBridgeService.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _applySystemUiChrome();
    }
  }

  Uri _loginUri() {
    return AppConfig.webUri(
      WebRouteContracts.login,
      queryParameters: WebQueryContracts.embeddedParams(
        nextPath: widget.nextPath,
        includeForceLogout: true,
      ),
    );
  }

  Future<void> _requestWebIdTokenIfNeeded() async {
    if (_authenticating) return;
    if (FirebaseAuth.instance.currentUser != null) return;
    final uri = _loginUri();
    if (uri.queryParameters[WebQueryContracts.forceLogout] ==
        WebQueryContracts.enabled) {
      return;
    }
    try {
      await _controller.runJavaScript(WebViewAuthScripts.probeWebIdToken);
    } catch (_) {}
  }

  Future<void> _onBridgeMessage(String raw) async {
    await WebViewAuthSyncController.handleBridgeMessage(
      rawMessage: raw,
      onWebToken: _signInWithCustomToken,
      onLogout: () async {
        _authSyncState.clearConsumedWebIdToken();
        await FirebaseAuth.instance.signOut();
      },
      onRequestNativeGoogle: _signInWithNativeGoogle,
    );
  }

  Future<void> _signInWithCustomToken(String webIdToken) async {
    if (_authSyncState.shouldSkipConsumedWebIdToken(webIdToken)) return;
    if (_authenticating) return;

    setState(() {
      _authenticating = true;
      _error = null;
    });

    try {
      await WebViewAuthSyncController.signInWithWebToken(
        webIdToken: webIdToken,
        auth: FirebaseAuth.instance,
        authBridgeService: _authBridgeService,
        syncState: _authSyncState,
      );
      _finishLogin();
      if (!mounted) return;
      setState(() {
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '네이티브 로그인 동기화 실패: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _authenticating = false;
        });
      }
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
        throw Exception('Google idToken이 없습니다. iOS URL Scheme 설정을 확인하세요.');
      }

      final credential = GoogleAuthProvider.credential(
        idToken: idToken,
        accessToken: authData.accessToken,
      );
      await FirebaseAuth.instance.signInWithCredential(credential);
      _finishLogin();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Google 로그인 실패: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _googleSigningIn = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _chromeColor,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: _overlayStyle,
        child: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_pageLoading || _authenticating || _googleSigningIn)
                const Center(
                  child: CircularProgressIndicator(),
                ),
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
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
