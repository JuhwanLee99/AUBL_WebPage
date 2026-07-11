import 'package:flutter_test/flutter_test.dart';

import 'package:aubl_flutter_app/core/config/app_config.dart';

void main() {
  test('web base URL is configured', () {
    expect(Uri.tryParse(AppConfig.webBaseUrl), isNotNull);
  });

  test('account deletion URL is configured', () {
    expect(Uri.tryParse(AppConfig.accountDeletionUrl), isNotNull);
  });
}
