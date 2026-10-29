/**
 * 양우종합건설 스마트 급여계산기 - Express 백엔드 서버
 * 
 * [원칙]
 * 1. 프론트엔드 코드에 비밀정보를 절대 노출하지 않고 서버 환경변수로 관리
 * 2. Vite dev middlewares 통합 (3000 포트)
 * 3. 멱등성 보장 및 SMTP 발송 상태 제공
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { getMailerConfig, sendPayslipEmail, getDispatchLogs } from './server/mailer.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON payload 제한 확장 (PDF base64 첨부 수용)
  app.use(express.json({ limit: '25mb' }));

  // 이메일 서버 연결 상태 조회 API
  app.get('/api/email/status', (req, res) => {
    const config = getMailerConfig();
    res.json({
      isConfigured: config.isConfigured,
      host: config.host || null,
      port: config.port || 587,
      from: config.from || '양우종합건설 급여팀 <payroll@yangwoo.co.kr>',
      message: config.isConfigured
        ? '이메일 발송 서버(SMTP)가 정상 연결되었습니다.'
        : '이메일 발송 설정 필요 (SMTP 환경변수 미등록)',
    });
  });

  // 발송 이력 조회 API
  app.get('/api/email/history', (req, res) => {
    const logs = getDispatchLogs();
    res.json({ logs });
  });

  // 개별 급여명세서 이메일 발송 API
  app.post('/api/email/send', async (req, res) => {
    const params = req.body;
    if (!params.employeeNo || !params.yearMonth || !params.approvalVersion) {
      return res.status(400).json({
        success: false,
        error: '필수 발송 파라미터(사번, 귀속연월, 승인버전)가 누락되었습니다.',
      });
    }

    const result = await sendPayslipEmail(params);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });

  // Vite 미들웨어 마운트
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[양우종합건설] 서버 가동 완료: http://localhost:${PORT}`);
  });
}

startServer();
