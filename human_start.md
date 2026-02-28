## 项目全貌

该项目用来制作一个CS架构的Agent任务分发平台，整个项目包含以下几个部分

1. Server：
   1. Agent任务的管理平台，所有任务在这里进行管理，提供针对任务的创建，申领，进度更新，关闭，关闭回调等功能。 也可以管理注册过来的Client
   2. Server提供RESTFul的API
2. Server DashBoard：
   1. 一个界面用来审阅Server,使用https://github.com/shadcn-ui/ui UI组件
   2. 要包含对任务板，任务状态，Client节点状态的显示
3. ClientNode
    1. 一个持续运行的客户端服务，注册到Server后可以管理自己下属的Agent并让Agent通过ClientNode持续和服务器交互
    2. 一个Client包含两类Agent 1. Manager，负责任务分发，管理，2. Worker负责执行 具体任务
4. ClientCLI：
    1. 实际和ClientNode交互的方式，通过IPC实际控制Client Node，要求所有功能完备

项目是测试驱动开发的，遵循完整的Git工作流程，每个功能都要提供充分的单元测试，每个任务完成后都要进行黑盒测试循环



## 技术细节

1. Sever管理的所有任务使用markdown/json文件实时落盘记录
2. Server所有操作使用队列单线程进行，不需要考虑高并发
3. 一个Client可以注册多个Agent，Client通过ACP管理启动及和Agent通信，一个Agent注册时包含以下要素
   1. Agent的打开形式，ACP版本的命令行
   2. Agent的工作目录
   3. Agent的职责倾向，即做什么（如果是Worker类型）
   4. 是否根据tag自动接取任务
   5. 是否允许创建多进程
4. Client创建时就要求注册manager Agent，manger agent负责任务领取，分发，监控Worker进度，自动更新node状态
   1. 提供manager agent的默认模板，skill，具体使用claude，cursor agent还是什么让用户选择，选择后可以自动创建工作目录
5. 提供一个Skill 可以让外部agent来辅助用户管理Client
6. Client以固定间隔获取server任务列表，有任何空余任务且存在空闲worker时唤醒manager，要求manager检查是否可以进行任务分发，如果可以则进行分发，也允许配置固定规则自动分发特定类型的任务到特定worker
7. client 接取的任务要本地持续轮询是否有worker在执行，client在启动worker执行任务时使用一个特定的prompt模板，这个模板使用一个单独的markdown记录，允许修改
8. 要求worker实时上报工作进度，一但对应worker意外中断要释放对应任务或启动新的worker