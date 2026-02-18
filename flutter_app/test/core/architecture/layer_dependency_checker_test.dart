import 'package:flutter_test/flutter_test.dart';

import '../../../tool/layer_dependency_checker.dart';

void main() {
  test('layer dependency rules should pass (core/app -> features guard)', () {
    final violations = LayerDependencyChecker.check();
    expect(violations, isEmpty);
  });
}
