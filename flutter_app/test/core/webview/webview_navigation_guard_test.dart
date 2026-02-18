import 'package:aubl_flutter_app/core/contracts/web_contracts.dart';
import 'package:aubl_flutter_app/core/webview/navigation/webview_navigation_guard.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WebViewNavigationGuard', () {
    test('detects google oauth request by host', () {
      final uri = Uri.parse('https://accounts.google.com/o/oauth2/v2/auth');
      expect(WebViewNavigationGuard.isGoogleOAuthRequest(uri), isTrue);
    });

    test('returns fallback uri when login query is missing embedded flags', () {
      final uri = Uri.https(
        'aubl-backup.web.app',
        WebRouteContracts.login,
        {WebQueryContracts.next: WebRouteContracts.scorekeeper},
      );
      final result = WebViewNavigationGuard.resolveLoginNavigation(
        uri: uri,
        webHost: 'aubl-backup.web.app',
        defaultNextPath: WebRouteContracts.scoreboard,
        hasCurrentUser: false,
      );

      expect(result.fallbackUri, isNotNull);
      expect(result.fallbackUri!.path, WebRouteContracts.login);
      expect(result.fallbackUri!.queryParameters[WebQueryContracts.embedded],
          WebQueryContracts.embeddedFlutter);
      expect(
          result.fallbackUri!.queryParameters[WebQueryContracts.nativeGoogle],
          WebQueryContracts.enabled);
      expect(result.fallbackUri!.queryParameters[WebQueryContracts.next],
          WebRouteContracts.scorekeeper);
    });

    test('returns pending redirect when current user exists on embedded login',
        () {
      final uri = Uri.https(
        'aubl-backup.web.app',
        WebRouteContracts.login,
        {
          WebQueryContracts.embedded: WebQueryContracts.embeddedFlutter,
          WebQueryContracts.nativeGoogle: WebQueryContracts.enabled,
          WebQueryContracts.next: WebRouteContracts.scorekeeper,
        },
      );
      final result = WebViewNavigationGuard.resolveLoginNavigation(
        uri: uri,
        webHost: 'aubl-backup.web.app',
        defaultNextPath: WebRouteContracts.scoreboard,
        hasCurrentUser: true,
      );

      expect(result.fallbackUri, isNull);
      expect(result.pendingRedirectUrl, isNotNull);
      expect(
          result.pendingRedirectUrl, contains(WebRouteContracts.scorekeeper));
      expect(
        result.pendingRedirectUrl,
        contains(
            '${WebQueryContracts.embedded}=${WebQueryContracts.embeddedFlutter}'),
      );
      expect(
        result.pendingRedirectUrl,
        contains(
            '${WebQueryContracts.nativeGoogle}=${WebQueryContracts.enabled}'),
      );
    });
  });
}
