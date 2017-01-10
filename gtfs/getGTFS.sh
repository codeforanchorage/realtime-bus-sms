muniURL="http://gtfs.muni.org/"
gtfsFile="People_Mover.gtfs.zip"
rawDir="raw/"

ret=$(curl $muniURL$gtfsFile -s -w "%{http_code}" -z $rawDir$gtfsFile -o $rawDir$gtfsFile) 
case $ret in
    304)
        echo File Unchanged, exiting; exit 0;;
    200)
        echo New File processing;
        unzip -uo $rawDir$gtfsFile  -d $rawDir
        for file in `ls converters/*.rb`; do
            ruby $file
        done
        # How do we get running nodePID
        nodePID=48931
        kill -SIGUSR2 $nodePID
        echo finished reload Node files
        exit 0;;
    *)
        echo error retrieving GTFS File; exit 1;;
esac

