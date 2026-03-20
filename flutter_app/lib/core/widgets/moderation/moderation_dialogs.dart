import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

class ModerationReasonOption {
  const ModerationReasonOption({
    required this.code,
    required this.label,
  });

  final String code;
  final String label;
}

class ModerationReasonInput {
  const ModerationReasonInput({
    required this.reasonCode,
    required this.reasonLabel,
    required this.detail,
  });

  final String reasonCode;
  final String reasonLabel;
  final String detail;
}

const moderationReasonOptions = <ModerationReasonOption>[
  ModerationReasonOption(code: 'spam', label: '스팸/홍보'),
  ModerationReasonOption(code: 'abuse', label: '욕설/괴롭힘'),
  ModerationReasonOption(code: 'sexual', label: '음란/성적 콘텐츠'),
  ModerationReasonOption(code: 'violence', label: '폭력/위협'),
  ModerationReasonOption(code: 'impersonation', label: '사칭/기만'),
  ModerationReasonOption(code: 'other', label: '기타'),
];

Future<ModerationReasonInput?> showModerationReasonDialog(
  BuildContext context, {
  required String title,
  required String confirmLabel,
}) async {
  var selected = moderationReasonOptions.first;
  var detailText = '';

  return showDialog<ModerationReasonInput>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setDialogState) => AlertDialog(
        backgroundColor: AppTheme.slate800,
        scrollable: true,
        title: Text(
          title,
          style: const TextStyle(color: Colors.white),
        ),
        content: SizedBox(
          width: 320,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selected.code,
                dropdownColor: AppTheme.slate700,
                decoration: const InputDecoration(
                  labelText: '사유',
                  labelStyle: TextStyle(color: AppTheme.slate400),
                ),
                items: moderationReasonOptions
                    .map(
                      (option) => DropdownMenuItem<String>(
                        value: option.code,
                        child: Text(
                          option.label,
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value == null) return;
                  final found = moderationReasonOptions.firstWhere(
                    (option) => option.code == value,
                    orElse: () => moderationReasonOptions.first,
                  );
                  setDialogState(() => selected = found);
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                initialValue: detailText,
                onChanged: (value) => detailText = value,
                maxLength: 240,
                minLines: 2,
                maxLines: 5,
                keyboardType: TextInputType.multiline,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: '상세 설명 (선택)',
                  alignLabelWithHint: true,
                  hintText: '운영팀이 확인할 수 있도록 상황을 적어주세요.',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('취소'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop(
                ModerationReasonInput(
                  reasonCode: selected.code,
                  reasonLabel: selected.label,
                  detail: detailText.trim(),
                ),
              );
            },
            child: Text(confirmLabel),
          ),
        ],
      ),
    ),
  );
}
