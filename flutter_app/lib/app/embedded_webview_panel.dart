import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/config/app_config.dart';
import '../core/contracts/flutter_bridge_contract.dart';
import '../core/contracts/web_contracts.dart';
import '../core/services/auth_session_service.dart';
import '../core/services/auth_bridge_service.dart';
import '../core/theme/app_theme.dart';
import '../core/webview/app_webview_screen.dart';
import '../core/webview/auth_sync/webview_auth_sync_controller.dart';
import '../core/webview/auth_sync/webview_auth_sync_state.dart';
import '../core/webview/navigation/webview_navigation_guard.dart';

/// MainShell 내부에서 하단바를 유지한 채 표시되는 WebView 패널.
class EmbeddedWebViewPanel extends StatefulWidget {
  const EmbeddedWebViewPanel({
    super.key,
    required this.path,
    required this.title,
    required this.onClose,
    this.fullscreen = false,
  });

  final String path;
  final String title;
  final VoidCallback onClose;

  /// true이면 상단바를 자동 숨기고 제스처로 토글.
  final bool fullscreen;

  @override
  State<EmbeddedWebViewPanel> createState() => _EmbeddedWebViewPanelState();
}

class _EmbeddedWebViewPanelState extends State<EmbeddedWebViewPanel> {
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

  // fullscreen 모드: 상단바 자동 숨김
  bool _barsVisible = true;
  Timer? _autoHideTimer;

  Uri get _pageUri => AppConfig.webUri(
        widget.path,
        queryParameters: WebQueryContracts.embeddedParams(),
      );

  String get _pageUrl => _pageUri.toString();

  /// 문자중계 경로에서 matchId 추출
  String? get _matchId {
    const prefix = WebRouteContracts.scoreboardTextPrefix;
    if (widget.path.startsWith(prefix)) {
      return widget.path
          .substring(prefix.length)
          .split('/')
          .first
          .split('?')
          .first;
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
        FlutterBridgeContracts.channelName,
        onMessageReceived: (msg) => _onBridgeMessage(msg.message),
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: _onNavigationRequest,
          onPageStarted: (_) {
            if (!mounted) return;
            setState(() {
              _loading = true;
              _injecting = false;
            });
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

    // fullscreen 모드: 3초 후 상단바 자동 숨김
    if (widget.fullscreen) {
      _scheduleAutoHide();
    }
  }

  void _scheduleAutoHide() {
    _autoHideTimer?.cancel();
    _autoHideTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _barsVisible) {
        setState(() => _barsVisible = false);
      }
    });
  }

  void _toggleBars() {
    if (!widget.fullscreen) return;
    setState(() => _barsVisible = !_barsVisible);
    if (_barsVisible) {
      _scheduleAutoHide();
    }
  }

  @override
  void dispose() {
    _autoHideTimer?.cancel();
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
    Map<String, dynamic> claims = const <String, dynamic>{};
    String? expectedNonce;

    try {
      final rawNonce = _generateNonce();
      final nonce = _sha256ofString(rawNonce);
      expectedNonce = nonce;
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
      claims = _decodeJwtClaims(identityToken);
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
        'Apple native auth failed: code=${e.code}, msg=${e.message}, '
        'aud=${claims['aud']}, iss=${claims['iss']}, tokenNonce=${claims['nonce']}, expectedNonce=$expectedNonce',
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
    final matchId = _matchId;
    final topPadding = MediaQuery.of(context).padding.top;
    final isFullscreen = widget.fullscreen;
    final showBars = !isFullscreen || _barsVisible;

    return GestureDetector(
      onTap: isFullscreen ? _toggleBars : null,
      behavior: HitTestBehavior.translucent,
      child: Column(
        children: [
          // 헤더 바 (fullscreen일 때 AnimatedSlide로 숨김)
          if (showBars)
            Container(
              color: AppTheme.slate900,
              padding: EdgeInsets.only(top: topPadding),
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
                // fullscreen에서 바 숨겨졌을 때 플로팅 뒤로가기 버튼
                if (isFullscreen && !_barsVisible)
                  Positioned(
                    left: 8,
                    top: topPadding + 4,
                    child: GestureDetector(
                      onTap: widget.onClose,
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.45),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.arrow_back,
                            color: Colors.white, size: 20),
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
                            path: WebRouteContracts.liveOverlay(matchId),
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
      ),
    );
  }
}
