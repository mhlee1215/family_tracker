/**
 * Alexa Skill Lambda handler (MVP).
 *
 * Environment variables:
 * - FAMILY_TRACKER_API_URL (e.g. https://example.com)
 * - FAMILY_TRACKER_API_TOKEN
 */

function speechResponse(text, endSession = true) {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text,
      },
      shouldEndSession: endSession,
    },
  };
}

function extractTaskText(intent = {}) {
  const slotValue = intent.slots?.task_text?.value;
  return String(slotValue || '').trim();
}

async function forwardTaskToFamilyTracker(payload) {
  const baseUrl = process.env.FAMILY_TRACKER_API_URL;
  const token = process.env.FAMILY_TRACKER_API_TOKEN;
  if (!baseUrl || !token) {
    throw new Error('Lambda env missing FAMILY_TRACKER_API_URL or FAMILY_TRACKER_API_TOKEN');
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/integrations/alexa/task`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error || `Family Tracker API error (${response.status})`;
    throw new Error(message);
  }
  return body;
}

export const handler = async (event) => {
  try {
    const requestType = event?.request?.type;
    if (requestType === 'LaunchRequest') {
      return speechResponse('무슨 할 일을 기록할까요? 예: 화장실 청소 내일까지.');
    }

    if (requestType === 'IntentRequest' && event?.request?.intent?.name === 'RecordTaskIntent') {
      const taskText = extractTaskText(event.request.intent);
      if (!taskText) return speechResponse('기록할 내용을 말해 주세요.');

      const payload = {
        text: taskText,
        requestId: event?.request?.requestId || `local-${Date.now()}`,
        requestedAt: event?.request?.timestamp || new Date().toISOString(),
        locale: event?.request?.locale || 'en-US',
        timezone: 'UTC',
      };

      await forwardTaskToFamilyTracker(payload);
      return speechResponse(`기록했어요. ${taskText}`);
    }

    return speechResponse('지원하지 않는 요청입니다.');
  } catch (error) {
    return speechResponse(`요청 처리 중 문제가 발생했어요. ${error.message}`);
  }
};
