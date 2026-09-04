import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/app_config.dart';
import '../contracts/flutter_bridge_contract.dart';
import '../contracts/web_contracts.dart';
import '../services/auth_session_service.dart';
import '../services/auth_bridge_service.dart';
import '../theme/app_theme.dart';
import 'auth_sync/webview_auth_sync_controller.dart';
import 'auth_sync/webview_auth_sync_state.dart';
import 'navigation/webview_navigation_guard.dart';

/// 범용 WebView 래퍼.
/// 스코어보드, 관리자 페이지 등 WebView가 필요한 화면에서 공통 사용.
class AppWebViewScreen extends StatefulWidget {
  const AppWebViewScreen({
    super.key,
    required this.path,
    required this.title,
    this.minimalHeader = false,
  });

  /// 웹 앱 경로 (계약 상수는 [WebRouteContracts] 참조)
  final String path;

  /// AppBar 타이틀
  final String title;

  /// 라이브 오버레이 등 상단 바를 숨기고 뒤로가기만 표시
  final bool minimalHeader;

  @override
  State<AppWebViewScreen> createState() => _AppWebViewScreenState();
}

class _AppWebViewScreenState extends State<AppWebViewScreen> {
  final AuthBridgeService _authBridgeService = AuthBridgeService();
  late final WebViewController _controller;
  StreamSubscription<User?>? _authSub;
  final WebViewAuthSyncState _authSyncState = WebViewAuthSyncState();

  bool _loading = true;
  bool _authenticating = false;
  bool _googleSigningIn = false;
  bool _appleSigningIn = false;
  bool _injecting = false;
  bool _loggedOut = false;
  String? _error;
  bool _loginBypassInFlight = false;
  String? _pendingLoginRedirect;
  bool _retriedErrFailed = false;

  bool get _isIosAppleNativeEnabled =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  void _applySystemUiChrome() {
    unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
    SystemChrome.setSystemUIOverlayStyle(AppTheme.systemUiStyle);
  }

  Uri get _pageUri => AppConfig.webUri(
        widget.path,
        queryParameters: WebQueryContracts.embeddedParams(),
      );

  String get _pageUrl => _pageUri.toString();

  @override
  void initState() {
    super.initState();
    _applySystemUiChrome();

    _controller = WebViewController()
      ..setBackgroundColor(AppTheme.slate900)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        FlutterBridgeContracts.channelName,
        onMessageReceived: (msg) => _onBridgeMessage(msg.message),
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: _onNavigationRequest,
          onPageStarted: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() {
              _loading = true;
              _injecting = false;
            });
          },
          onPageFinished: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() => _loading = false);
            unawaited(_injectAuthIfNeeded());
            unawaited(_requestWebIdTokenIfNeeded());
            if (_pendingLoginRedirect != null && !_loginBypassInFlight) {
              final redirect = _pendingLoginRedirect!;
              _pendingLoginRedirect = null;
              _loginBypassInFlight = true;
              unawaited(
                  _injectAuthIfNeeded(redirectUrl: redirect).whenComplete(() {
                _loginBypassInFlight = false;
              }));
            }
          },
          onWebResourceError: (error) {
            if (WebViewNavigationGuard.shouldRetryFailedNavigation(
              error,
              hasRetried: _retriedErrFailed,
            )) {
              _retriedErrFailed = true;
              unawaited(_controller.reload());
              return;
            }
            if (WebViewNavigationGuard.shouldIgnoreWebError(error)) return;
            if (!mounted) return;
            setState(() {
              _loading = false;
              _injecting = false;
              _error = '웹 로딩 실패: ${error.description}';
            });
          },
        ),
      )
      ..loadRequest(_pageUri);

    final current = FirebaseAuth.instance.currentUser;
    if (current != null) {
      WebViewAuthSyncController.seedFromCurrentUser(current, _authSyncState);
      unawaited(_injectAuthIfNeeded());
    }

    // auth state 직접 구독: 재로그인 시 _loggedOut 초기화 포함
    _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user == null) {
        _authSyncState.clearObservedUid();
        return;
      }
      if (_loggedOut && mounted) setState(() => _loggedOut = false);
      if (_authSyncState.shouldSkipObservedUid(user.uid)) return;
      _authSyncState.markObservedUid(user.uid);
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

    if (WebViewNavigationGuard.isGoogleOAuthRequest(uri)) {
      if (!_googleSigningIn) {
        unawaited(_signInWithNativeGoogle());
      }
      return NavigationDecision.prevent;
    }
    if (WebViewNavigationGuard.isAppleOAuthRequest(uri)) {
      if (!_isIosAppleNativeEnabled) return NavigationDecision.navigate;
      if (!_appleSigningIn) {
        unawaited(_signInWithNativeApple());
      }
      return NavigationDecision.prevent;
    }

    final loginResolution = WebViewNavigationGuard.resolveLoginNavigation(
      uri: uri,
      webHost: Uri.parse(AppConfig.webBaseUrl).host,
      defaultNextPath: widget.path,
      hasCurrentUser: FirebaseAuth.instance.currentUser != null,
    );
    if (loginResolution.fallbackUri != null) {
      _controller.loadRequest(loginResolution.fallbackUri!);
      return NavigationDecision.prevent;
    }
    if (loginResolution.pendingRedirectUrl != null) {
      _pendingLoginRedirect = loginResolution.pendingRedirectUrl;
    }

    return NavigationDecision.navigate;
  }

  Future<void> _onBridgeMessage(String raw) async {
    await WebViewAuthSyncController.handleBridgeMessage(
      rawMessage: raw,
      onWebToken: _signInWithCustomToken,
      onLogout: () async {
        if (mounted) setState(() => _loggedOut = true);
        _authSyncState.reset();
        await AuthSessionService.signOutFast(clearWebViewCookies: false);
      },
      onRequestNativeGoogle: _signInWithNativeGoogle,
    );
  }

  /// Flutter 로그인 상태를 WebView에 주입
  Future<void> _injectAuthIfNeeded({String? redirectUrl}) async {
    if (_loggedOut) return;
    final shouldShowInjecting = redirectUrl != null;
    if (shouldShowInjecting && mounted) {
      setState(() => _injecting = true);
    }
    try {
      await WebViewAuthSyncController.injectAuthIfNeeded(
        auth: FirebaseAuth.instance,
        authBridgeService: _authBridgeService,
        controller: _controller,
        syncState: _authSyncState,
        redirectUrl: redirectUrl,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _injecting = false;
        _error = '인증 주입 실패: $e';
      });
    } finally {
      if (shouldShowInjecting && mounted) {
        setState(() => _injecting = false);
      }
    }
  }

  Future<void> _requestWebIdTokenIfNeeded() async {
    try {
      await WebViewAuthSyncController.requestWebIdTokenIfNeeded(
        auth: FirebaseAuth.instance,
        controller: _controller,
      );
    } catch (_) {
      // 토큰 조회 실패 시 무시
    }
  }

  Future<void> _signInWithCustomToken(String webIdToken) async {
    if (_authenticating) return;
    if (!mounted) return;
    setState(() {
      _loggedOut = false;
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
      _loggedOut = false;
      _googleSigningIn = true;
      _error = null;
    });
    try {
      final account = await GoogleSignIn.instance.authenticate();
      final authData = account.authentication;
      final idToken = authData.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw Exception('Google idToken을 가져오지 못했습니다.');
      }
      final credential = GoogleAuthProvider.credential(
        idToken: idToken,
      );
      await FirebaseAuth.instance.signInWithCredential(credential);
      await _injectAuthIfNeeded(redirectUrl: _pageUrl);
    } on GoogleSignInException catch (e) {
      debugPrint(
          'Google native auth failed: code=${e.code}, msg=${e.description}');
      if (e.code == GoogleSignInExceptionCode.canceled) return;
      if (!mounted) return;
      setState(() => _error = 'Google 로그인 실패: $e');
    } catch (e) {
      debugPrint('Google native auth failed: $e');
      if (!mounted) return;
      setState(() => _error = 'Google 로그인 실패: $e');
    } finally {
      if (mounted) setState(() => _googleSigningIn = false);
    }
  }

  String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }

  String _sha256ofString(String input) {
    final bytes = utf8.encode(input);
    return sha256.convert(bytes).toString();
  }

  Map<String, dynamic> _decodeJwtClaims(String jwt) {
    final parts = jwt.split('.');
    if (parts.length < 2) return const <String, dynamic>{};
    try {
      final payload =
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final decoded = jsonDecode(payload);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) {
        return decoded.map(
          (key, value) => MapEntry(key.toString(), value),
        );
      }
    } catch (_) {}
    return const <String, dynamic>{};
  }

  Future<void> _signInWithNativeApple() async {
    if (_appleSigningIn || _authenticating) return;
    if (!_isIosAppleNativeEnabled) return;
    if (FirebaseAuth.instance.currentUser != null) {
      unawaited(_injectAuthIfNeeded(redirectUrl: _pageUrl));
      return;
    }
    setState(() {
      _loggedOut = false;
      _appleSigningIn = true;
      _error = null;
    });
    try {
      final rawNonce = _generateNonce();
      final nonce = _sha256ofString(rawNonce);
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: nonce,
      );
      final identityToken = credential.identityToken;
      if (identityToken == null || identityToken.isEmpty) {
        throw Exception('Apple identity token이 없습니다.');
      }
      final claims = _decodeJwtClaims(identityToken);
      final tokenNonce = claims['nonce']?.toString();
      if (tokenNonce != null && tokenNonce.isNotEmpty && tokenNonce != nonce) {
        throw Exception('Apple nonce 검증 실패');
      }
      final oauthCredential = AppleAuthProvider.credentialWithIDToken(
        identityToken,
        rawNonce,
        AppleFullPersonName(
          givenName: credential.givenName,
          familyName: credential.familyName,
        ),
      );
      await FirebaseAuth.instance.signInWithCredential(oauthCredential);
      unawaited(_injectAuthIfNeeded(redirectUrl: _pageUrl));
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return;
      if (!mounted) return;
      setState(() => _error = 'Apple 로그인 실패: $e');
    } on FirebaseAuthException catch (e) {
      debugPrint(
        'Apple native auth failed: code=${e.code}, msg=${e.message}',
      );
      if (!mounted) return;
      setState(() => _error = 'Apple 로그인 실패: $e');
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Apple 로그인 실패: $e');
    } finally {
      if (mounted) setState(() => _appleSigningIn = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.minimalHeader ? null : AppBar(title: Text(widget.title)),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading ||
              _authenticating ||
              _googleSigningIn ||
              _appleSigningIn)
            const Center(child: CircularProgressIndicator()),
          // 주입 중 WebView 랜딩페이지 가리기 (불투명 오버레이)
          if (_injecting)
            Container(
              color: AppTheme.slate900,
              child: const Center(child: CircularProgressIndicator()),
            ),
          if (widget.minimalHeader)
            SafeArea(
              child: Align(
                alignment: Alignment.topLeft,
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                    onPressed: () => Navigator.of(context).maybePop(),
                    tooltip: '뒤로가기',
                  ),
                ),
              ),
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
                      child: const Icon(Icons.close,
                          color: Colors.white, size: 18),
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
