package com.zarate.jearvis;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.List;

/**
 * Presses WhatsApp's "Send" button ONLY when TARS armed an auto-send in the last 20 s
 * (i.e. you explicitly ordered "send a WhatsApp to X"). Never reads or stores chats.
 */
public class JarvisAccessibilityService extends AccessibilityService {
    static volatile long armedUntil = 0L;
    static volatile JarvisAccessibilityService running = null;

    static void arm() {
        armedUntil = System.currentTimeMillis() + 20_000L;
    }

    static boolean isActive() {
        return running != null;
    }

    @Override
    protected void onServiceConnected() {
        running = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (System.currentTimeMillis() > armedUntil) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        String pkg = String.valueOf(root.getPackageName());
        String[] ids = {pkg + ":id/send", "com.whatsapp:id/send", "com.whatsapp.w4b:id/send"};
        for (String vid : ids) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(vid);
            if (nodes != null && !nodes.isEmpty()) {
                AccessibilityNodeInfo btn = nodes.get(0);
                if (btn.isEnabled() && btn.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    armedUntil = 0L;
                    if (MainActivity.instance != null) MainActivity.instance.onWhatsAppSent();
                    return;
                }
            }
        }
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        running = null;
        super.onDestroy();
    }
}
