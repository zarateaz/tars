package com.zarate.jearvis;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** Persistent reminder storage + exact alarm scheduling (survives reboot). */
public final class ReminderStore {
    static final String PREFS = "jarvis_reminders";
    static final String KEY = "list";
    static final String CHANNEL_ID = "jarvis_reminders_v1";
    static final String ACTION_FIRE = "com.zarate.jearvis.REMINDER_FIRE";
    static final String ACTION_SNOOZE = "com.zarate.jearvis.REMINDER_SNOOZE";

    private ReminderStore() {}

    static JSONArray load(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            return new JSONArray(sp.getString(KEY, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void save(Context ctx, JSONArray arr) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply();
    }

    static void ensureChannel(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Recordatorios TARS",
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Alertas de recordatorios programados por voz");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 120, 80, 120, 80, 400});
        ch.enableLights(true);
        ch.setLightColor(0xFF00F0FF);
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build());
        nm.createNotificationChannel(ch);
    }

    static String add(Context ctx, long timeMs, String text) {
        String id = "rem-" + System.currentTimeMillis() + "-" + Integer.toHexString((int) (Math.random() * 0xFFFFF));
        try {
            JSONArray arr = load(ctx);
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("text", text);
            o.put("time", timeMs);
            o.put("done", false);
            arr.put(o);
            save(ctx, arr);
            schedule(ctx, id, timeMs, text);
        } catch (Exception ignored) {}
        return id;
    }

    static void markDone(Context ctx, String id) {
        try {
            JSONArray arr = load(ctx);
            JSONArray out = new JSONArray();
            long cutoff = System.currentTimeMillis() - 24L * 3600_000L;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (o.optString("id").equals(id)) o.put("done", true);
                if (o.optBoolean("done") && o.optLong("time") < cutoff) continue; // prune old
                out.put(o);
            }
            save(ctx, out);
        } catch (Exception ignored) {}
    }

    static void remove(Context ctx, String id) {
        try {
            JSONArray arr = load(ctx);
            JSONArray out = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (!o.optString("id").equals(id)) out.put(o);
            }
            save(ctx, out);
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(firePending(ctx, id, ""));
        } catch (Exception ignored) {}
    }

    static PendingIntent firePending(Context ctx, String id, String text) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        i.setAction(ACTION_FIRE);
        i.putExtra("id", id);
        i.putExtra("text", text);
        return PendingIntent.getBroadcast(ctx, id.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context ctx, String id, long timeMs, String text) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = firePending(ctx, id, text);
        try {
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (exact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timeMs, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timeMs, pi);
            }
        } catch (SecurityException se) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timeMs, pi);
        }
    }

    static void rescheduleAll(Context ctx) {
        try {
            JSONArray arr = load(ctx);
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (o.optBoolean("done")) continue;
                long t = Math.max(o.optLong("time"), now + 5000);
                schedule(ctx, o.optString("id"), t, o.optString("text"));
            }
        } catch (Exception ignored) {}
    }
}
