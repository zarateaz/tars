package com.zarate.jearvis;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedList;

/**
 * Module 4 - Smart Notification Listener:
 * Captures incoming messages from WhatsApp, Telegram, Gmail, SMS, etc.
 * and relays them into the HUD and Laptop TARS voice announcer.
 */
public class JarvisNotificationService extends NotificationListenerService {
    private static final int MAX_ITEMS = 15;
    private static final LinkedList<JSONObject> recentList = new LinkedList<>();

    public static synchronized String getRecentJson() {
        JSONArray arr = new JSONArray();
        for (JSONObject o : recentList) {
            arr.put(o);
        }
        return arr.toString();
    }

    private static String mapAppLabel(String pkg) {
        if ("com.whatsapp".equals(pkg) || "com.whatsapp.w4b".equals(pkg)) return "WhatsApp";
        if ("org.telegram.messenger".equals(pkg)) return "Telegram";
        if ("com.google.android.gm".equals(pkg)) return "Gmail";
        if (pkg.contains("messaging") || pkg.contains("mms") || pkg.contains("sms")) return "SMS";
        if ("com.instagram.android".equals(pkg)) return "Instagram";
        if (pkg.contains("yape")) return "Yape";
        if (pkg.contains("bcp")) return "BCP";
        if (pkg.contains("interbank") || pkg.contains("plin")) return "Interbank/Plin";
        if (pkg.contains("bbva")) return "BBVA";
        return pkg;
    }

    private static boolean isWatchedPackage(String pkg) {
        if (pkg == null) return false;
        String p = pkg.toLowerCase();
        return p.equals("com.whatsapp")
                || p.equals("com.whatsapp.w4b")
                || p.equals("org.telegram.messenger")
                || p.equals("com.google.android.gm")
                || p.equals("com.google.android.apps.messaging")
                || p.equals("com.android.mms")
                || p.equals("com.instagram.android")
                || p.contains("yape")
                || p.contains("bcp")
                || p.contains("interbank")
                || p.contains("plin")
                || p.contains("bbva");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if ("com.zarate.jearvis".equals(pkg)) return;

        Notification notif = sbn.getNotification();
        if (notif == null) return;
        if ((notif.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;
        if ((notif.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        if (!isWatchedPackage(pkg)) return;

        Bundle extras = notif.extras;
        if (extras == null) return;

        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        String sender = titleCs != null ? titleCs.toString().trim() : "";
        String text = textCs != null ? textCs.toString().trim() : "";
        if (sender.isEmpty() && text.isEmpty()) return;

        try {
            JSONObject obj = new JSONObject();
            obj.put("id", sbn.getKey() + "_" + sbn.getPostTime());
            obj.put("pkg", pkg);
            obj.put("app", mapAppLabel(pkg));
            obj.put("sender", sender);
            obj.put("text", text);
            obj.put("time", sbn.getPostTime());

            synchronized (JarvisNotificationService.class) {
                if (!recentList.isEmpty()) {
                    JSONObject last = recentList.getFirst();
                    if (last.optString("sender").equals(sender)
                            && last.optString("text").equals(text)
                            && Math.abs(sbn.getPostTime() - last.optLong("time")) < 2500) {
                        return;
                    }
                }
                recentList.addFirst(obj);
                while (recentList.size() > MAX_ITEMS) {
                    recentList.removeLast();
                }
            }

            if (MainActivity.instance != null) {
                MainActivity.instance.onPhoneNotification(obj.toString());
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // no-op
    }
}
