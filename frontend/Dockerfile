# 多阶段构建：Node 构建 → Nginx 托管
# Stage 1: 构建 React 应用
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Nginx 托管静态文件
FROM nginx:alpine
# 拷贝构建产物
COPY --from=builder /app/dist /usr/share/nginx/html
# 拷贝 Nginx 配置（含 API 反代）
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
