# 多阶段构建 - 第一阶段：构建应用
# 使用官方镜像源，但通过配置Docker镜像加速器提高下载速度
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 使用国内镜像源加速npm安装
RUN npm config set registry https://registry.npmmirror.com

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 接收构建时传入的API Key参数
ARG API_KEY

# 如果提供了API_KEY，则设置环境变量
RUN if [ ! -z "$API_KEY" ]; then export VITE_GEMINI_API_KEY=$API_KEY; fi

# 构建应用
RUN npm run build

# 第二阶段：使用Nginx服务静态文件
# 使用官方镜像源，但通过配置Docker镜像加速器提高下载速度
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/nginx:alpine

# 复制自定义的nginx配置（可选）
# COPY nginx.conf /etc/nginx/nginx.conf

# 从构建阶段复制构建结果到nginx的默认目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]