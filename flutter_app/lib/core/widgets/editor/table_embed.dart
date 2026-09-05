import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import '../../theme/app_theme.dart';

const String aublTableEmbedType = 'aublTable';

const int _tableMinRows = 2;
const int _tableMaxRows = 400;
const int _tableMinCols = 2;
const int _tableMaxCols = 40;

class AublTableData {
  const AublTableData({
    required this.rows,
    required this.cols,
    required this.cells,
  });

  final int rows;
  final int cols;
  final List<List<String>> cells;

  factory AublTableData.initial({int rows = 3, int cols = 3}) {
    return AublTableData.fromDynamic({'rows': rows, 'cols': cols});
  }

  factory AublTableData.fromDynamic(dynamic raw) {
    dynamic decoded = raw;
    if (raw is String) {
      try {
        decoded = jsonDecode(raw);
      } catch (_) {
        decoded = null;
      }
    }

    final map = decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : <String, dynamic>{};
    final rows = _clampInt(map['rows'], _tableMinRows, _tableMaxRows, 3);
    final cols = _clampInt(map['cols'], _tableMinCols, _tableMaxCols, 3);
    final sourceCells = map['cells'];

    final nextCells = List<List<String>>.generate(rows, (rowIdx) {
      final row = sourceCells is List && rowIdx < sourceCells.length
          ? sourceCells[rowIdx]
          : null;
      return List<String>.generate(cols, (colIdx) {
        if (row is List && colIdx < row.length) {
          final value = row[colIdx];
          if (value is String) return value;
          if (value != null) return value.toString();
        }
        return _defaultCellValue(rowIdx, colIdx);
      });
    });

    return AublTableData(rows: rows, cols: cols, cells: nextCells);
  }

  Map<String, dynamic> toMap() {
    return {'rows': rows, 'cols': cols, 'cells': cells};
  }

  AublTableData resize(int nextRows, int nextCols) {
    final safeRows = _clampInt(nextRows, _tableMinRows, _tableMaxRows, rows);
    final safeCols = _clampInt(nextCols, _tableMinCols, _tableMaxCols, cols);
    final nextCells = List<List<String>>.generate(safeRows, (rowIdx) {
      return List<String>.generate(safeCols, (colIdx) {
        if (rowIdx < cells.length && colIdx < cells[rowIdx].length) {
          return cells[rowIdx][colIdx];
        }
        return _defaultCellValue(rowIdx, colIdx);
      });
    });
    return AublTableData(rows: safeRows, cols: safeCols, cells: nextCells);
  }

  AublTableData updateCell(int rowIdx, int colIdx, String value) {
    if (rowIdx < 0 || rowIdx >= rows || colIdx < 0 || colIdx >= cols) {
      return this;
    }
    final nextCells = cells
        .map((row) => List<String>.from(row))
        .toList(growable: false);
    nextCells[rowIdx][colIdx] = value;
    return AublTableData(rows: rows, cols: cols, cells: nextCells);
  }
}

Embeddable buildAublTableEmbeddable(AublTableData tableData) {
  return Embeddable(aublTableEmbedType, tableData.toMap());
}

class AublTableEmbedBuilder extends EmbedBuilder {
  const AublTableEmbedBuilder({this.onEditRequested});

  final Future<void> Function(
    BuildContext context,
    EmbedContext embedContext,
    AublTableData tableData,
  )?
  onEditRequested;

  @override
  String get key => aublTableEmbedType;

  @override
  bool get expanded => true;

  @override
  String toPlainText(Embed node) => '[표]';

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final tableData = AublTableData.fromDynamic(embedContext.node.value.data);
    final editable = !embedContext.readOnly && onEditRequested != null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: _AublTableCard(
        tableData: tableData,
        editable: editable,
        onTap: editable
            ? () => onEditRequested!(context, embedContext, tableData)
            : null,
      ),
    );
  }
}

Future<AublTableData?> showAublTableEditorDialog({
  required BuildContext context,
  required AublTableData initialData,
  String title = '표 편집',
}) async {
  var draft = initialData;

  return showDialog<AublTableData>(
    context: context,
    builder: (dialogContext) {
      return StatefulBuilder(
        builder: (dialogContext, setState) {
          final colors = dialogContext.aublColors;

          void resize(int rows, int cols) {
            setState(() {
              draft = draft.resize(rows, cols);
            });
          }

          final maxDialogHeight = math.min(
            MediaQuery.of(dialogContext).size.height * 0.52,
            360.0,
          );

          return AlertDialog(
            scrollable: true,
            backgroundColor: colors.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(4),
            ),
            title: Text(
              title,
              style: TextStyle(
                color: colors.navyStrong,
                fontWeight: FontWeight.w800,
              ),
            ),
            content: SizedBox(
              width: math.min(
                MediaQuery.of(dialogContext).size.width * 0.92,
                820,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _TableActionButton(
                        label: '행 +',
                        onPressed: () => resize(draft.rows + 1, draft.cols),
                      ),
                      _TableActionButton(
                        label: '행 -',
                        onPressed: () => resize(draft.rows - 1, draft.cols),
                      ),
                      _TableActionButton(
                        label: '열 +',
                        onPressed: () => resize(draft.rows, draft.cols + 1),
                      ),
                      _TableActionButton(
                        label: '열 -',
                        onPressed: () => resize(draft.rows, draft.cols - 1),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${draft.rows}행 x ${draft.cols}열',
                    style: TextStyle(color: colors.muted, fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    constraints: BoxConstraints(maxHeight: maxDialogHeight),
                    decoration: BoxDecoration(
                      border: Border.all(color: colors.line),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: SingleChildScrollView(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Table(
                          border: TableBorder.all(color: colors.line),
                          defaultColumnWidth: const FixedColumnWidth(140),
                          children: List<TableRow>.generate(draft.rows, (
                            rowIdx,
                          ) {
                            return TableRow(
                              children: List<Widget>.generate(draft.cols, (
                                colIdx,
                              ) {
                                final isHeader = rowIdx == 0;
                                return Container(
                                  color: isHeader
                                      ? colors.surfaceMuted
                                      : colors.surface,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  child: TextFormField(
                                    key: ValueKey(
                                      'table-$rowIdx-$colIdx-${draft.cells[rowIdx][colIdx]}',
                                    ),
                                    initialValue: draft.cells[rowIdx][colIdx],
                                    onChanged: (value) {
                                      draft = draft.updateCell(
                                        rowIdx,
                                        colIdx,
                                        value,
                                      );
                                    },
                                    style: TextStyle(
                                      color: isHeader
                                          ? colors.navyStrong
                                          : colors.ink,
                                      fontSize: 13,
                                      fontWeight: isHeader
                                          ? FontWeight.w700
                                          : FontWeight.w500,
                                    ),
                                    decoration: InputDecoration(
                                      border: InputBorder.none,
                                      isDense: true,
                                      constraints: const BoxConstraints(
                                        minHeight: 44,
                                      ),
                                      hintText: isHeader
                                          ? '헤더 ${colIdx + 1}'
                                          : '값 입력',
                                      hintStyle: TextStyle(
                                        color: colors.muted,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                );
                              }),
                            );
                          }),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '표를 누르면 다시 셀 단위로 수정할 수 있습니다.',
                    style: TextStyle(color: colors.muted, fontSize: 12),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('취소'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, draft),
                child: Text('적용', style: TextStyle(color: colors.cobalt)),
              ),
            ],
          );
        },
      );
    },
  );
}

class _AublTableCard extends StatelessWidget {
  const _AublTableCard({
    required this.tableData,
    required this.editable,
    required this.onTap,
  });

  final AublTableData tableData;
  final bool editable;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Material(
      color: colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(4),
        side: BorderSide(color: colors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Table(
                border: TableBorder.all(color: colors.line),
                defaultColumnWidth: const FixedColumnWidth(120),
                children: List<TableRow>.generate(tableData.rows, (rowIdx) {
                  return TableRow(
                    children: List<Widget>.generate(tableData.cols, (colIdx) {
                      final isHeader = rowIdx == 0;
                      return Ink(
                        color: isHeader ? colors.surfaceMuted : colors.surface,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 6,
                        ),
                        child: Text(
                          tableData.cells[rowIdx][colIdx].isEmpty
                              ? ' '
                              : tableData.cells[rowIdx][colIdx],
                          style: TextStyle(
                            color: isHeader ? colors.navyStrong : colors.ink,
                            fontSize: 12,
                            fontWeight: isHeader
                                ? FontWeight.w700
                                : FontWeight.w500,
                          ),
                        ),
                      );
                    }),
                  );
                }),
              ),
            ),
            if (editable)
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                child: Text(
                  '표를 탭해서 셀 편집',
                  style: TextStyle(color: colors.muted, fontSize: 11),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TableActionButton extends StatelessWidget {
  const _TableActionButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: colors.navy,
        side: BorderSide(color: colors.lineStrong),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        minimumSize: const Size(72, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      onPressed: onPressed,
      child: Text(
        label,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}

int _clampInt(dynamic raw, int min, int max, int fallback) {
  int? value;
  if (raw is int) {
    value = raw;
  } else if (raw is num) {
    value = raw.toInt();
  } else if (raw is String) {
    value = int.tryParse(raw);
  }
  value ??= fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

String _defaultCellValue(int rowIdx, int colIdx) {
  if (rowIdx == 0) return '항목${colIdx + 1}';
  return '';
}
