@echo off
set covidserverlaunchdir=%CD%\dist\%1\
cd "\Program Files\IIS Express"
iisexpress /path:%covidserverlaunchdir%
