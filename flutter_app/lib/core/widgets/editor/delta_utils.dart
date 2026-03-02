import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'table_embed.dart';

class DeltaAttachmentSummary {
  const DeltaAttachmentSummary({
    this.hasImage = false,
    this.hasVideo = false,
    this.hasLink = false,
  });

  final bool hasImage;
  final bool hasVideo;
  final bool hasLink;

  bool get hasAny => hasImage || hasVideo || hasLink;
}

final RegExp _urlPattern = RegExp("((https?:\\/\\/|www\\.)[^\\s<>\"']+)");

/// Quill Delta JSON 포맷 여부 확인
bool isJsonDelta(String s) {
  if (s.isEmpty) return false;
  try {
    final decoded = jsonDecode(s);
    if (decoded is Map && decoded.containsKey('ops')) return true;
    if (decoded is List) return true;
    return false;
  } catch (_) {
    return false;
  }
}

/// Delta JSON string 또는 plain text로부터 QuillController 생성
QuillController safeControllerFrom(String content) {
  try {
    if (isJsonDelta(content)) {
      final decoded = jsonDecode(content);
      List<dynamic> ops;
      if (decoded is Map && decoded.containsKey('ops')) {
        ops = decoded['ops'] as List<dynamic>;
      } else if (decoded is List) {
        ops = decoded;
      } else {
        ops = [
          {'insert': content.isEmpty ? '\n' : '$content\n'}
        ];
      }
      ops = _convertQuillTableOpsToAublTableEmbeds(ops);
      // 마지막 op가 '\n'으로 끝나는지 보장
      if (ops.isNotEmpty) {
        final last = ops.last;
        if (last is Map &&
            last['insert'] is String &&
            !(last['insert'] as String).endsWith('\n')) {
          ops = [
            ...ops,
            {'insert': '\n'}
          ];
        }
      } else {
        ops = [
          {'insert': '\n'}
        ];
      }
      final doc = Document.fromJson(ops);
      return QuillController(
          document: doc, selection: const TextSelection.collapsed(offset: 0));
    }
  } catch (_) {}

  // plain text fallback
  final doc = content.isEmpty
      ? Document()
      : Document.fromJson([
          {'insert': '$content\n'}
        ]);
  return QuillController(
      document: doc, selection: const TextSelection.collapsed(offset: 0));
}

/// Delta JSON string으로 인코딩
String controllerToJson(QuillController controller) {
  final delta = controller.document.toDelta();
  return jsonEncode({'ops': delta.toJson()});
}

/// Delta JSON → 목록 미리보기용 순수 텍스트 추출
/// 이미지 → '[이미지]', 동영상 → '[동영상]' 대체
String deltaToPreviewText(String deltaJson) {
  if (!isJsonDelta(deltaJson)) return deltaJson;
  try {
    final decoded = jsonDecode(deltaJson);
    List<dynamic> ops;
    if (decoded is Map && decoded.containsKey('ops')) {
      ops = decoded['ops'] as List<dynamic>;
    } else if (decoded is List) {
      ops = decoded;
    } else {
      return deltaJson;
    }
    final buf = StringBuffer();
    for (final op in ops) {
      if (op is Map) {
        final insert = op['insert'];
        if (insert is String) {
          buf.write(insert);
        } else if (insert is Map) {
          if (insert.containsKey('image')) buf.write('[이미지]');
          if (insert.containsKey('video')) buf.write('[동영상]');
          if (insert.containsKey(aublTableEmbedType)) buf.write('[표]');
        }
      }
    }
    return buf.toString().replaceAll(RegExp(r'\n+'), ' ').trim();
  } catch (_) {
    return '';
  }
}

/// Google Drive 공유 링크 → 직접 이미지 URL 변환
/// drive.google.com/file/d/FILE_ID/... → lh3.googleusercontent.com/d/FILE_ID
String toGoogleDriveImageUrl(String url) {
  final fileMatch =
      RegExp(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)').firstMatch(url);
  if (fileMatch != null) {
    return 'https://lh3.googleusercontent.com/d/${fileMatch.group(1)}';
  }
  final openMatch =
      RegExp(r'drive\.google\.com/open\?.*id=([a-zA-Z0-9_-]+)').firstMatch(url);
  if (openMatch != null) {
    return 'https://lh3.googleusercontent.com/d/${openMatch.group(1)}';
  }
  return url;
}

/// YouTube/외부 동영상 URL → embed URL 변환
String toYouTubeEmbedUrl(String url) {
  final match = RegExp(r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]+)')
      .firstMatch(url);
  if (match != null) return 'https://www.youtube.com/embed/${match.group(1)}';
  return url;
}

/// 에디터 내용이 실질적으로 비어있는지 확인
bool isDeltaEmpty(String deltaJson) {
  if (deltaJson.isEmpty) return true;
  try {
    if (isJsonDelta(deltaJson)) {
      final decoded = jsonDecode(deltaJson);
      List<dynamic> ops;
      if (decoded is Map && decoded.containsKey('ops')) {
        ops = decoded['ops'] as List<dynamic>;
      } else if (decoded is List) {
        ops = decoded;
      } else {
        return false;
      }
      // ops가 단일 '\n' 삽입만 있으면 빈 것으로 간주
      if (ops.isEmpty) return true;
      if (ops.length == 1) {
        final op = ops[0];
        if (op is Map && op['insert'] == '\n') return true;
      }
      return false;
    }
    return deltaJson.trim().isEmpty;
  } catch (_) {
    return deltaJson.trim().isEmpty;
  }
}

DeltaAttachmentSummary summarizeDeltaAttachments(String content) {
  var hasImage = false;
  var hasVideo = false;
  var hasLink = false;

  if (!isJsonDelta(content)) {
    hasLink = _urlPattern.hasMatch(content);
    return DeltaAttachmentSummary(
      hasImage: hasImage,
      hasVideo: hasVideo,
      hasLink: hasLink,
    );
  }

  try {
    final decoded = jsonDecode(content);
    final ops = switch (decoded) {
      {'ops': List<dynamic> ops} => ops,
      List<dynamic> list => list,
      _ => const <dynamic>[],
    };

    for (final op in ops) {
      if (op is! Map) continue;
      final insert = op['insert'];
      if (insert is String && _urlPattern.hasMatch(insert)) {
        hasLink = true;
      } else if (insert is Map) {
        if (insert.containsKey('image')) hasImage = true;
        if (insert.containsKey('video')) hasVideo = true;
      }

      final attrs = op['attributes'];
      if (attrs is Map) {
        final link = attrs['link'];
        if (link is String && link.trim().isNotEmpty) {
          hasLink = true;
        }
      }

      if (hasImage && hasVideo && hasLink) {
        break;
      }
    }
  } catch (_) {}

  return DeltaAttachmentSummary(
    hasImage: hasImage,
    hasVideo: hasVideo,
    hasLink: hasLink,
  );
}

List<dynamic> _convertQuillTableOpsToAublTableEmbeds(List<dynamic> sourceOps) {
  var hasLegacyTable = false;
  for (final op in sourceOps) {
    if (op is! Map) continue;
    final attrs = op['attributes'];
    if (attrs is Map && attrs['table'] != null) {
      hasLegacyTable = true;
      break;
    }
  }
  if (!hasLegacyTable) return sourceOps;

  final converted = <dynamic>[];
  final pendingPieces = <({String text, Map<String, dynamic>? attrs})>[];
  final tableRows = <String, List<String>>{};
  final tableRowOrder = <String>[];
  var inTable = false;

  void flushPendingText() {
    if (pendingPieces.isEmpty) return;
    for (final piece in pendingPieces) {
      if (piece.text.isEmpty) continue;
      if (piece.attrs == null || piece.attrs!.isEmpty) {
        converted.add({'insert': piece.text});
      } else {
        converted.add({
          'insert': piece.text,
          'attributes': piece.attrs,
        });
      }
    }
    pendingPieces.clear();
  }

  void flushTable() {
    if (tableRowOrder.isEmpty) return;
    final rowCount = tableRowOrder.length;
    var colCount = 0;
    for (final key in tableRowOrder) {
      final cols = tableRows[key]?.length ?? 0;
      if (cols > colCount) colCount = cols;
    }
    if (rowCount == 0 || colCount == 0) {
      tableRows.clear();
      tableRowOrder.clear();
      return;
    }
    final cells = List<List<String>>.generate(rowCount, (rowIdx) {
      final row = tableRows[tableRowOrder[rowIdx]] ?? const <String>[];
      return List<String>.generate(
        colCount,
        (colIdx) => colIdx < row.length ? row[colIdx] : '',
      );
    });
    converted.add({
      'insert': {
        aublTableEmbedType: {
          'rows': rowCount,
          'cols': colCount,
          'cells': cells,
        }
      }
    });
    converted.add({'insert': '\n'});
    tableRows.clear();
    tableRowOrder.clear();
  }

  void appendPendingText(String text, Map<String, dynamic>? attrs) {
    if (text.isEmpty) return;
    if (pendingPieces.isNotEmpty &&
        _mapEquals(pendingPieces.last.attrs, attrs)) {
      final prev = pendingPieces.removeLast();
      pendingPieces.add((text: '${prev.text}$text', attrs: prev.attrs));
      return;
    }
    pendingPieces.add((text: text, attrs: attrs));
  }

  for (final rawOp in sourceOps) {
    if (rawOp is! Map) {
      if (inTable) {
        flushTable();
        inTable = false;
      }
      flushPendingText();
      converted.add(rawOp);
      continue;
    }

    final insert = rawOp['insert'];
    final attrs = _normalizeAttrs(rawOp['attributes']);

    if (insert is! String) {
      if (inTable) {
        flushTable();
        inTable = false;
      }
      flushPendingText();
      converted.add(_cloneOp(rawOp));
      continue;
    }

    var cursor = 0;
    while (cursor < insert.length) {
      final newlineIndex = insert.indexOf('\n', cursor);
      if (newlineIndex < 0) {
        appendPendingText(
          insert.substring(cursor),
          _withoutTableAttr(attrs),
        );
        break;
      }

      if (newlineIndex > cursor) {
        appendPendingText(
          insert.substring(cursor, newlineIndex),
          _withoutTableAttr(attrs),
        );
      }

      final tableKey = attrs?['table'];
      if (tableKey != null) {
        final rowKey = tableKey.toString();
        if (!tableRows.containsKey(rowKey)) {
          tableRows[rowKey] = <String>[];
          tableRowOrder.add(rowKey);
        }
        final cellText = pendingPieces.map((piece) => piece.text).join();
        tableRows[rowKey]!.add(cellText);
        pendingPieces.clear();
        inTable = true;
      } else {
        if (inTable) {
          flushTable();
          inTable = false;
        }
        flushPendingText();
        final newlineAttrs = _withoutTableAttr(attrs);
        if (newlineAttrs == null || newlineAttrs.isEmpty) {
          converted.add({'insert': '\n'});
        } else {
          converted.add({
            'insert': '\n',
            'attributes': newlineAttrs,
          });
        }
      }
      cursor = newlineIndex + 1;
    }
  }

  if (inTable) {
    flushTable();
  }
  flushPendingText();
  return converted;
}

Map<String, dynamic>? _normalizeAttrs(dynamic raw) {
  if (raw is! Map) return null;
  final attrs = Map<String, dynamic>.from(raw);
  if (attrs.isEmpty) return null;
  return attrs;
}

Map<String, dynamic>? _withoutTableAttr(Map<String, dynamic>? attrs) {
  if (attrs == null || attrs.isEmpty) return null;
  final next = Map<String, dynamic>.from(attrs)..remove('table');
  if (next.isEmpty) return null;
  return next;
}

Map<String, dynamic> _cloneOp(Map rawOp) {
  final op = Map<String, dynamic>.from(rawOp);
  final attrs = op['attributes'];
  if (attrs is Map) {
    op['attributes'] = Map<String, dynamic>.from(attrs);
  }
  return op;
}

bool _mapEquals(Map<String, dynamic>? a, Map<String, dynamic>? b) {
  final left = (a == null || a.isEmpty) ? null : a;
  final right = (b == null || b.isEmpty) ? null : b;
  if (identical(left, right)) return true;
  if (left == null || right == null) return false;
  if (left.length != right.length) return false;
  for (final entry in left.entries) {
    if (right[entry.key] != entry.value) return false;
  }
  return true;
}
