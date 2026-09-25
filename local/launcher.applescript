try
 do shell script "node '<项目根目录>/local/launch.mjs'"
on error errorMessage
 display alert "求职工作台未能打开" message errorMessage
end try
