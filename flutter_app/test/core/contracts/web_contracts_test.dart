import 'package:aubl_flutter_app/core/contracts/web_contracts.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('game-detail references stay within one encoded path segment', () {
    expect(
      WebRouteContracts.scoreboardText('up-game-1'),
      '/scoreboard-text/up-game-1',
    );
    expect(
      WebRouteContracts.scoreboardText('other/game?theme=dark'),
      '/scoreboard-text/other%2Fgame%3Ftheme%3Ddark',
    );
  });
  group('WebQueryContracts.embeddedParams', () {
    test('includes embedded/nativeGoogle/next for valid next path', () {
      final query = WebQueryContracts.embeddedParams(
        nextPath: WebRouteContracts.scorekeeper,
      );

      expect(
        query[WebQueryContracts.embedded],
        WebQueryContracts.embeddedFlutter,
      );
      expect(query[WebQueryContracts.nativeGoogle], WebQueryContracts.enabled);
      expect(query[WebQueryContracts.next], WebRouteContracts.scorekeeper);
    });

    test('includes forceLogout when requested', () {
      final query = WebQueryContracts.embeddedParams(includeForceLogout: true);
      expect(query[WebQueryContracts.forceLogout], WebQueryContracts.enabled);
    });

    test('includes only a supported native theme', () {
      final dark = WebQueryContracts.embeddedParams(themeName: 'dark');
      final system = WebQueryContracts.embeddedParams(themeName: 'system');

      expect(dark[WebQueryContracts.theme], 'dark');
      expect(system.containsKey(WebQueryContracts.theme), isFalse);
    });

    test('does not include next when next path is invalid', () {
      final query = WebQueryContracts.embeddedParams(nextPath: 'scorekeeper');
      expect(query.containsKey(WebQueryContracts.next), isFalse);
    });
  });
}
