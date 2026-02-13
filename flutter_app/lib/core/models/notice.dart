import 'package:cloud_firestore/cloud_firestore.dart';

class Notice {
  const Notice({
    required this.id,
    required this.title,
    required this.category,
    required this.content,
    required this.author,
    required this.createdAt,
    this.isImportant = false,
    this.allowComments = true,
  });

  final String id;
  final String title;
  final String category; // 일반 | 징계 | 경기공지 | 긴급
  final String content;
  final String author;
  final int createdAt;
  final bool isImportant;
  final bool allowComments;

  factory Notice.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return Notice(
      id: doc.id,
      title: d['title'] as String? ?? '',
      category: d['category'] as String? ?? '일반',
      content: d['content'] as String? ?? '',
      author: d['author'] as String? ?? '',
      createdAt: d['createdAt'] as int? ?? 0,
      isImportant: d['isImportant'] as bool? ?? false,
      allowComments: d['allowComments'] as bool? ?? true,
    );
  }

  factory Notice.fromJson(Map<String, dynamic> d) => Notice(
        id: d['id'] as String? ?? '',
        title: d['title'] as String? ?? '',
        category: d['category'] as String? ?? '일반',
        content: d['content'] as String? ?? '',
        author: d['author'] as String? ?? '',
        createdAt: d['createdAt'] as int? ?? 0,
        isImportant: d['isImportant'] as bool? ?? false,
        allowComments: d['allowComments'] as bool? ?? true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'category': category,
        'content': content,
        'author': author,
        'createdAt': createdAt,
        'isImportant': isImportant,
        'allowComments': allowComments,
      };
}
