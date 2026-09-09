#!/bin/sh
# [INPUT]: 依赖同目录 owndsh-server.jar 与系统 java/ps/awk/kill 命令。
# [OUTPUT]: 提供 OwnDsh Server 的前台 start/restart 与 stop/status 运维入口，日志交给终端或进程管理器采集。
# [POS]: server 手工部署的 POSIX 启停脚本，与 Windows owndsh.bat 对应。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
# ./owndsh.sh start 启动 stop 停止 restart 重启 status 状态
AppName=owndsh-server.jar

# JVM参数
JVM_OPTS="-Dname=$AppName  -Duser.timezone=Asia/Shanghai -Xms512m -Xmx1024m -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=512m -XX:+HeapDumpOnOutOfMemoryError -XX:+UseZGC"

if [ "$1" = "" ];
then
    echo -e "\033[0;31m 未输入操作名 \033[0m  \033[0;34m {start|stop|restart|status} \033[0m"
    exit 1
fi

if [ "$AppName" = "" ];
then
    echo -e "\033[0;31m 未输入应用名 \033[0m"
    exit 1
fi

start()
{
    PID=`ps -ef |grep java|grep $AppName|grep -v grep|awk '{print $2}'`

    if [ x"$PID" != x"" ]; then
        echo "$AppName is running..."
    else
        exec java $JVM_OPTS -jar "$AppName"
    fi
}

stop()
{
    echo "Stop $AppName"

    PID=""
    query(){
        PID=`ps -ef |grep java|grep $AppName|grep -v grep|awk '{print $2}'`
    }

    query
    if [ x"$PID" != x"" ]; then
        kill -TERM $PID
        echo "$AppName (pid:$PID) exiting..."
        while [ x"$PID" != x"" ]
        do
            sleep 1
            query
        done
        echo "$AppName exited."
    else
        echo "$AppName already stopped."
    fi
}

restart()
{
    stop
    sleep 2
    start
}

status()
{
    PID=`ps -ef |grep java|grep $AppName|grep -v grep|wc -l`
    if [ $PID != 0 ];then
        echo "$AppName is running..."
    else
        echo "$AppName is not running..."
    fi
}

case $1 in
    start)
    start;;
    stop)
    stop;;
    restart)
    restart;;
    status)
    status;;
    *)

esac
