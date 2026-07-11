import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../../tool/layer_dependency_checker.dart';

void main() {
  group('LayerDependencyChecker rules', () {
    test('detects core -> features violation', () {
      final root = _createTempProject({
        'lib/core/foo.dart': "import '../features/bar.dart';\n",
        'lib/features/bar.dart': 'class Bar {}\n',
      });

      addTearDown(() => root.deleteSync(recursive: true));

      final violations = LayerDependencyChecker.check(projectRoot: root);
      expect(
        violations.any((v) => v.message.contains('core 레이어에서 features')),
        isTrue,
      );
    });

    test('detects app -> features direct violation', () {
      final root = _createTempProject({
        'lib/app/main_shell.dart':
            "import '../features/home/home_screen.dart';\n",
        'lib/features/home/home_screen.dart': 'class HomeScreen {}\n',
      });

      addTearDown(() => root.deleteSync(recursive: true));

      final violations = LayerDependencyChecker.check(projectRoot: root);
      expect(
        violations
            .any((v) => v.message.contains('features/feature_entries.dart')),
        isTrue,
      );
    });

    test('allows app -> features/feature_entries.dart', () {
      final root = _createTempProject({
        'lib/app/main_shell.dart':
            "import '../features/feature_entries.dart';\n",
        'lib/features/feature_entries.dart':
            "export 'home/home_screen.dart';\n",
        'lib/features/home/home_screen.dart': 'class HomeScreen {}\n',
      });

      addTearDown(() => root.deleteSync(recursive: true));

      final violations = LayerDependencyChecker.check(projectRoot: root);
      expect(violations, isEmpty);
    });
  });
}

Directory _createTempProject(Map<String, String> files) {
  final root = Directory.systemTemp.createTempSync('aubl-layer-checker-test-');
  for (final entry in files.entries) {
    final path = '${root.path}/${entry.key}';
    final file = File(path);
    file.parent.createSync(recursive: true);
    file.writeAsStringSync(entry.value);
  }
  return root;
}
