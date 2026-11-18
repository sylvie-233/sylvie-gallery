import { Hono } from 'hono';

import { handleAdminUpload, type AdminUploadKind } from '../../services/admin/upload.service.js';
import type { AppEnv } from '../../types/context.js';
import { HttpError, success } from '../../utils/http.js';
import { currentAdminId } from '../../utils/request.js';

const router = new Hono<AppEnv>();

router.post('/', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  const kindInput = String(body['kind'] ?? 'image');
  if (!(file instanceof File)) {
    throw new HttpError(400, '请选择要上传的文件');
  }
  if (kindInput !== 'image' && kindInput !== 'video' && kindInput !== 'avatar') {
    throw new HttpError(400, '上传类型无效');
  }
  const result = await handleAdminUpload(
    file,
    kindInput as AdminUploadKind,
    currentAdminId(c),
  );
  return success(c, result, '上传成功', 201);
});

export default router;
