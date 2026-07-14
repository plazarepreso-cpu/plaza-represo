const DAILY_AUTOMATION_HANDLER_ = 'runDailyAutomation_';
const DAILY_AUTOMATION_HOUR_ = 8;

function getAutomationStatus_() {
  const triggerCount = ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === DAILY_AUTOMATION_HANDLER_)
    .length;
  return {
    installed: triggerCount === 1,
    triggerCount,
    handler: DAILY_AUTOMATION_HANDLER_,
    hour: DAILY_AUTOMATION_HOUR_,
    timeZone: APP_CONFIG.TIME_ZONE
  };
}

function getAutomationStatus() {
  requireOwner_();
  return getAutomationStatus_();
}

function installAutomations() {
  const user = requireOwner_();
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === DAILY_AUTOMATION_HANDLER_)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger(DAILY_AUTOMATION_HANDLER_)
    .timeBased()
    .atHour(DAILY_AUTOMATION_HOUR_)
    .everyDays(1)
    .inTimezone(APP_CONFIG.TIME_ZONE)
    .create();

  const status = getAutomationStatus_();
  try {
    audit_('INSTALAR_AUTOMATIZACIONES', 'Sistema', DAILY_AUTOMATION_HANDLER_, {
      installedBy: user.email,
      triggerCount: status.triggerCount,
      hour: status.hour,
      timeZone: status.timeZone
    });
  } catch (ignored) {}
  return status;
}

function runAutomationNow() {
  requireOwner_();
  return runDailyAutomation_();
}

function runDailyAutomation_() {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  const summary = {
    processed: 0,
    reconciled: 0,
    cancelled: 0,
    paymentDue: 0,
    errors: 0
  };

  try {
    lock.waitLock(30000);
    lockAcquired = true;
    const today = parseLocalDate_(todayIso_(), '12:00');

    listObjects_('Contratos').forEach(contract => {
      if (!['CONFIRMADO', 'PAGADO', 'CANCELADO'].includes(String(contract.status))) return;
      summary.processed += 1;

      try {
        if (contract.status === 'CANCELADO') {
          markCalendarEventCancelled_(contract);
          summary.cancelled += 1;
          return;
        }

        if (Number(contract.balance) > 0) {
          const eventDate = parseLocalDate_(contract.eventDate, '12:00');
          const daysUntilEvent = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
          if (daysUntilEvent >= 0 && daysUntilEvent <= 7) summary.paymentDue += 1;
        }

        const calendarEventId = updateCalendarEvent_(contract);
        if (calendarEventId && String(calendarEventId) !== String(contract.calendarEventId || '')) {
          updateObject_('Contratos', 'id', contract.id, { calendarEventId });
        }
        summary.reconciled += 1;
      } catch (error) {
        summary.errors += 1;
      }
    });

    try { audit_('EJECUTAR_AUTOMATIZACION', 'Sistema', DAILY_AUTOMATION_HANDLER_, summary); }
    catch (ignored) {}
    return summary;
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}
