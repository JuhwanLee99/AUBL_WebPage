import 'dart:io';

enum AppLayer {
  app,
  core,
  features,
  other,
}

class LayerViolation {
  LayerViolation({
    required this.filePath,
    required this.importPath,
    required this.message,
  });

  final String filePath;
  final String importPath;
  final String message;
}

class LayerDependencyChecker {
  const LayerDependencyChecker._();

  static const String _internalPackagePrefix = 'package:aubl_flutter_app/';
  static const String _appFeatureEntryPath = 'features/feature_entries.dart';
  static final RegExp _importPattern =
      RegExp(r'''^\s*import\s+['"]([^'"]+)['"]\s*;''', multiLine: true);

  static List<LayerViolation> check({Directory? projectRoot}) {
    final root = projectRoot ?? Directory.current;
    final libDir = Directory('${root.path}/lib');
    if (!libDir.existsSync()) {
      throw StateError('lib 디렉터리를 찾을 수 없습니다: ${libDir.path}');
    }

    final violations = <LayerViolation>[];
    final entities = libDir
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => _isDartSource(file.path));

    for (final file in entities) {
      final filePath = file.path.replaceAll('\\', '/');
      final fileRelPath = filePath.substring(libDir.path.length + 1);
      final fromLayer = _layerFromRelativePath(fileRelPath);
      if (fromLayer == AppLayer.other) continue;

      final source = file.readAsStringSync();
      for (final match in _importPattern.allMatches(source)) {
        final rawImport = match.group(1);
        if (rawImport == null) continue;
        final targetRelPath =
            _resolveInternalImport(fileRelPath, rawImport.trim());
        if (targetRelPath == null) continue;
        final toLayer = _layerFromRelativePath(targetRelPath);

        if (fromLayer == AppLayer.core && toLayer == AppLayer.features) {
          violations.add(
            LayerViolation(
              filePath: 'lib/$fileRelPath',
              importPath: rawImport,
              message: 'core 레이어에서 features 레이어를 참조할 수 없습니다.',
            ),
          );
        }
        if (fromLayer == AppLayer.app &&
            toLayer == AppLayer.features &&
            targetRelPath != _appFeatureEntryPath) {
          violations.add(
            LayerViolation(
              filePath: 'lib/$fileRelPath',
              importPath: rawImport,
              message: 'app 레이어는 features/feature_entries.dart만 참조할 수 있습니다.',
            ),
          );
        }
      }
    }

    return violations;
  }

  static bool _isDartSource(String path) {
    if (!path.endsWith('.dart')) return false;
    final normalized = path.replaceAll('\\', '/');
    if (normalized.endsWith('.g.dart')) return false;
    if (normalized.endsWith('.freezed.dart')) return false;
    if (normalized.endsWith('.mocks.dart')) return false;
    return true;
  }

  static AppLayer _layerFromRelativePath(String relativePath) {
    final normalized = relativePath.replaceAll('\\', '/');
    if (normalized.startsWith('core/')) return AppLayer.core;
    if (normalized.startsWith('app/')) return AppLayer.app;
    if (normalized.startsWith('features/')) return AppLayer.features;
    return AppLayer.other;
  }

  static String? _resolveInternalImport(
    String importerRelativePath,
    String importPath,
  ) {
    if (importPath.startsWith('dart:')) return null;
    if (importPath.startsWith('package:') &&
        !importPath.startsWith(_internalPackagePrefix)) {
      return null;
    }

    if (importPath.startsWith(_internalPackagePrefix)) {
      return importPath.substring(_internalPackagePrefix.length);
    }

    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      return _resolveRelative(importerRelativePath, importPath);
    }

    if (importPath.startsWith('core/') ||
        importPath.startsWith('app/') ||
        importPath.startsWith('features/')) {
      return importPath;
    }

    return null;
  }

  static String _resolveRelative(
      String importerRelativePath, String importPath) {
    final baseSegments = importerRelativePath.split('/');
    if (baseSegments.isNotEmpty) {
      baseSegments.removeLast();
    }

    for (final segment in importPath.split('/')) {
      if (segment.isEmpty || segment == '.') continue;
      if (segment == '..') {
        if (baseSegments.isNotEmpty) {
          baseSegments.removeLast();
        }
        continue;
      }
      baseSegments.add(segment);
    }

    return baseSegments.join('/');
  }
}

void main(List<String> args) {
  final violations = LayerDependencyChecker.check();
  if (violations.isEmpty) {
    stdout.writeln('Layer dependency check passed.');
    return;
  }

  stderr.writeln(
    'Layer dependency check failed (${violations.length} violation(s)).',
  );
  for (final violation in violations) {
    stderr.writeln(
      '- ${violation.filePath}: import "${violation.importPath}" -> ${violation.message}',
    );
  }
  exitCode = 1;
}
