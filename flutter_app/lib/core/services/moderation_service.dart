import 'package:cloud_firestore/cloud_firestore.dart';

class BlockedUserEntry {
  const BlockedUserEntry({
    required this.uid,
    required this.label,
    required this.blockedAt,
    this.lastReasonType,
    this.lastContentDomain,
  });

  final String uid;
  final String label;
  final int blockedAt;
  final String? lastReasonType;
  final String? lastContentDomain;

  factory BlockedUserEntry.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? const <String, dynamic>{};
    return BlockedUserEntry(
      uid: doc.id,
      label: data['label'] as String? ?? '알 수 없는 사용자',
      blockedAt: data['blockedAt'] as int? ?? 0,
      lastReasonType: data['lastReasonType'] as String?,
      lastContentDomain: data['lastContentDomain'] as String?,
    );
  }
}

class ModerationReportPayload {
  const ModerationReportPayload({
    required this.action,
    required this.reasonType,
    required this.reasonDetail,
    required this.targetUid,
    required this.targetLabel,
    required this.contentDomain,
    required this.contentId,
    required this.contentPreview,
    this.parentContentId,
    this.contextId,
  });

  final String action; // report | block
  final String reasonType;
  final String reasonDetail;
  final String targetUid;
  final String targetLabel;
  final String contentDomain;
  final String contentId;
  final String contentPreview;
  final String? parentContentId;
  final String? contextId;
}

class ModerationService {
  ModerationService({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> _blockedUsersRef(String uid) {
    return _db.collection('userModeration').doc(uid).collection('blockedUsers');
  }

  Stream<Set<String>> watchBlockedUserIds(String uid) {
    return _blockedUsersRef(uid).snapshots().map(
          (snap) => snap.docs.map((d) => d.id).toSet(),
        );
  }

  Stream<List<BlockedUserEntry>> watchBlockedUsers(String uid) {
    return _blockedUsersRef(uid)
        .orderBy('blockedAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map(BlockedUserEntry.fromFirestore).toList());
  }

  Future<void> unblockUser({
    required String blockerUid,
    required String blockedUid,
  }) {
    return _blockedUsersRef(blockerUid).doc(blockedUid).delete();
  }

  Future<void> reportContent({
    required String reporterUid,
    required String reporterLabel,
    required ModerationReportPayload payload,
  }) {
    return _db.collection('contentReports').add({
      'action': payload.action,
      'reasonType': payload.reasonType,
      'reasonDetail': payload.reasonDetail,
      'reporterUid': reporterUid,
      'reporterLabel': reporterLabel,
      'targetUid': payload.targetUid,
      'targetLabel': payload.targetLabel,
      'contentDomain': payload.contentDomain,
      'contentId': payload.contentId,
      'parentContentId': payload.parentContentId,
      'contextId': payload.contextId,
      'contentPreview': payload.contentPreview,
      'status': 'pending',
      'createdAt': DateTime.now().millisecondsSinceEpoch,
    });
  }

  Future<void> blockUserAndReport({
    required String blockerUid,
    required String blockerLabel,
    required ModerationReportPayload payload,
  }) async {
    final blockedRef = _blockedUsersRef(blockerUid).doc(payload.targetUid);
    final reportRef = _db.collection('contentReports').doc();
    final now = DateTime.now().millisecondsSinceEpoch;

    final batch = _db.batch();
    batch.set(
      blockedRef,
      {
        'uid': payload.targetUid,
        'label': payload.targetLabel,
        'blockedAt': now,
        'lastReasonType': payload.reasonType,
        'lastContentDomain': payload.contentDomain,
      },
      SetOptions(merge: true),
    );
    batch.set(
      reportRef,
      {
        'action': 'block',
        'reasonType': payload.reasonType,
        'reasonDetail': payload.reasonDetail,
        'reporterUid': blockerUid,
        'reporterLabel': blockerLabel,
        'targetUid': payload.targetUid,
        'targetLabel': payload.targetLabel,
        'contentDomain': payload.contentDomain,
        'contentId': payload.contentId,
        'parentContentId': payload.parentContentId,
        'contextId': payload.contextId,
        'contentPreview': payload.contentPreview,
        'status': 'pending',
        'createdAt': now,
      },
    );
    await batch.commit();
  }
}
