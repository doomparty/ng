# 声明使用的基础镜像
FROM node:14

# 设置工作目录
WORKDIR /app

# 拷贝package.json 和 package-lock.json 文件
COPY package*.json ./

# 安装项目依赖
RUN npm install

# 拷贝项目其余文件
COPY . .

# 暴露容器需要的端口
EXPOSE 3000

# 定义容器的启动命令
CMD [ "node", "index.js" ]
