# OpenSys 用户记忆

## 用户偏好
- 编程语言偏好：Python
- 代码风格：注释用中文
- 交流语言：中文

## 项目上下文
- 当前项目：OpenSys AI Agent
- 技术栈：LangGraph + FastAPI + Docker + SQLite
- 工作目录：/home/tang/project/opensys
- workspace 文件夹路径：/workspace，存放用户上传的文件，只读权限
- output 文件夹路径：./output（/app/output），存放所有输出文件，可读写权限
- 处理规则：处理 workspace 中的文件时，必须先拷贝到 output 文件夹或建立临时文件夹进行操作，不能直接修改 workspace 中的文件

## 重要事实
<!-- AI 在对话中发现的重要信息会自动记录在这里 -->

- 大文件处理规则：处理大文件时（如超过 100KB 的 JSON 文件），必须分段读取，避免内存溢出。优先使用流式读取或分块处理方式
- 你编写脚本的思路是先编写脚本保存到脚本文件夹，然后执行，执行出错的时候就直接修改脚本文件了，不要反复的重写一个脚本