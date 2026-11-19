/**
 * 后台上传控制器：解析 multipart 表单并交给上传 service 处理。
 * 按 kind 区分图片 / 视频 / 头像的存储与处理规则。
 */
import { handleAdminUpload, type AdminUploadKind } from '../../services/admin/upload.service.js';
import type { AppContext } from '../../types/context.js';
import { HttpError, success } from '../../utils/http.js';
import { currentAdminId } from '../../utils/request.js';

/** POST /api/admin/upload —— file 来自 multipart；kind 缺省为 image，非法值直接 400。 */
export async function upload(c: AppContext): Promise<Response> {
  const body = await c.req.parseBody();
  const file = body['file'];
  // 表单字段都是字符串；未传 kind 时按图片处理。
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
}
