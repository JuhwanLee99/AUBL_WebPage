import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';

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

  factory AublTableData.initial({
    int rows = 3,
    int cols = 3,
  }) {
    return AublTableData.fromDynamic({
      'rows': rows,
      'cols': cols,
    });
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

    return AublTableData(
      rows: rows,
      cols: cols,
      cells: nextCells,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'rows': rows,
      'cols': cols,
      'cells': cells,
    };
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
    final nextCells =
        cells.map((row) => List<String>.from(row)).toList(growable: false);
    nextCells[rowIdx][colIdx] = value;
    return AublTableData(rows: rows, cols: cols, cells: nextCells);
  }
}

Embeddable buildAublTableEmbeddable(AublTableData tableData) {
  return Embeddable(aublTableEmbedType, tableData.toMap());
}

class AublTableEmbedBuilder extends EmbedBuilder {
  const AublTableEmbedBuilder({
    this.onEditRequested,
  });

  final Future<void> Function(
    BuildContext context,
    EmbedContext embedContext,
    AublTableData tableData,
  )? onEditRequested;

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
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: editable
            ? () => onEditRequested!(context, embedContext, tableData)
            : null,
        child: _AublTableCard(
          tableData: tableData,
          editable: editable,
        ),
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
          void resize(int rows, int cols) {
            setState(() {
              draft = draft.resize(rows, cols);
            });
          }

          final maxDialogHeight =
              math.min(MediaQuery.of(dialogContext).size.height * 0.52, 360.0);

          return AlertDialog(
            backgroundColor: const Color(0xFF1e293b),
            title: Text(title, style: const TextStyle(color: Colors.white)),
            content: SizedBox(
              width:
                  math.min(MediaQuery.of(dialogContext).size.width * 0.92, 820),
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
                    style:
                        const TextStyle(color: Color(0xFF94a3b8), fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    constraints: BoxConstraints(maxHeight: maxDialogHeight),
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xFF475569)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: SingleChildScrollView(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Table(
                          border:
                              TableBorder.all(color: const Color(0xFF475569)),
                          defaultColumnWidth: const FixedColumnWidth(140),
                          children:
                              List<TableRow>.generate(draft.rows, (rowIdx) {
                            return TableRow(
                              children:
                                  List<Widget>.generate(draft.cols, (colIdx) {
                                final isHeader = rowIdx == 0;
                                return Container(
                                  color: isHeader
                                      ? const Color(0xFF0f172a)
                                      : const Color(0xFF111827),
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 3),
                                  child: TextFormField(
                                    key: ValueKey(
                                        'table-$rowIdx-$colIdx-${draft.cells[rowIdx][colIdx]}'),
                                    initialValue: draft.cells[rowIdx][colIdx],
                                    onChanged: (value) {
                                      draft = draft.updateCell(
                                        rowIdx,
                                        colIdx,
                                        value,
                                      );
                                    },
                                    style: const TextStyle(
                                      color: Color(0xFFe2e8f0),
                                      fontSize: 13,
                                    ),
                                    decoration: InputDecoration(
                                      border: InputBorder.none,
                                      isDense: true,
                                      hintText: isHeader
                                          ? '헤더 ${colIdx + 1}'
                                          : '값 입력',
                                      hintStyle: const TextStyle(
                                        color: Color(0xFF64748b),
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
                  const Text(
                    '표를 누르면 다시 셀 단위로 수정할 수 있습니다.',
                    style: TextStyle(color: Color(0xFF94a3b8), fontSize: 12),
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
                child: const Text(
                  '적용',
                  style: TextStyle(color: Color(0xFF3b82f6)),
                ),
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
  });

  final AublTableData tableData;
  final bool editable;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF475569)),
        color: const Color(0xFF0f172a),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Table(
              border: TableBorder.all(color: const Color(0xFF475569)),
              defaultColumnWidth: const FixedColumnWidth(120),
              children: List<TableRow>.generate(tableData.rows, (rowIdx) {
                return TableRow(
                  children: List<Widget>.generate(tableData.cols, (colIdx) {
                    final isHeader = rowIdx == 0;
                    return Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 6,
                      ),
                      color: isHeader
                          ? const Color(0xFF1e293b)
                          : const Color(0xFF0f172a),
                      child: Text(
                        tableData.cells[rowIdx][colIdx].isEmpty
                            ? ' '
                            : tableData.cells[rowIdx][colIdx],
                        style: TextStyle(
                          color: isHeader
                              ? const Color(0xFFf8fafc)
                              : const Color(0xFFe2e8f0),
                          fontSize: 12,
                          fontWeight:
                              isHeader ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    );
                  }),
                );
              }),
            ),
          ),
          if (editable)
            const Padding(
              padding: EdgeInsets.fromLTRB(8, 6, 8, 8),
              child: Text(
                '표를 탭해서 셀 편집',
                style: TextStyle(
                  color: Color(0xFF94a3b8),
                  fontSize: 11,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TableActionButton extends StatelessWidget {
  const _TableActionButton({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFFcbd5e1),
        side: const BorderSide(color: Color(0xFF475569)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      onPressed: onPressed,
      child: Text(label, style: const TextStyle(fontSize: 12)),
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
