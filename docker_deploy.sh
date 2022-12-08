sudo docker tag cesium-standalone:1.0.55 acrarolibotnonprod.azurecr.io/cesium-standalone:1.0.55 &&\
sudo docker push acrarolibotnonprod.azurecr.io/cesium-standalone:1.0.55 &&\
helm uninstall release2 && helm install release2 helm