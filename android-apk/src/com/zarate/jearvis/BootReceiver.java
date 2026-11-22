package com.zarate.jearvis;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Reprograma los recordatorios tras reiniciar o actualizar la app. Solo acepta esas acciones del sistema. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            ReminderStore.rescheduleAll(ctx);
        }
    }
}
