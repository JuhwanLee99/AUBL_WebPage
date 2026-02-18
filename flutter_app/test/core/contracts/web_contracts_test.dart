import 'package:aubl_flutter_app/core/contracts/web_contracts.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WebQueryContracts.embeddedParams', () {
    test('includes embedded/nativeGoogle/next for valid next path', () {
      final query = WebQueryContracts.embeddedParams(
        nextPath: WebRouteContracts.scorekeeper,
      );

      expect(
          query[WebQueryContracts.embedded], WebQueryContracts.embeddedFlutter);
      expect(query[WebQueryContracts.nativeGoogle], WebQueryContracts.enabled);
      expect(query[WebQueryContracts.next], WebRouteContracts.scorekeeper);
    });

    test('includes forceLogout when requested', () {
      final query = WebQueryContracts.embeddedParams(includeForceLogout: true);
      expect(query[WebQueryContracts.forceLogout], WebQueryContracts.enabled);
    });

    test('does not include next when next path is invalid', () {
      final query = WebQueryContracts.embeddedParams(nextPath: 'scorekeeper');
      expect(query.containsKey(WebQueryContracts.next), isFalse);
    });
  });
}
