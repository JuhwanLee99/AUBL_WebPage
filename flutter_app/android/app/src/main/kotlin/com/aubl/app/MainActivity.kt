package com.aubl.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import io.flutter.embedding.android.FlutterFragmentActivity

class MainActivity : FlutterFragmentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Android 15(targetSdk 35) 기본 edge-to-edge 동작에 맞춰
    // 하위 OS에서도 동일한 window inset 동작을 강제한다.
    enableEdgeToEdge()
  }
}
