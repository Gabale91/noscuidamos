package br.com.gabale.noscuidamos.teste;
import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.print.PrintManager;
import android.print.PrintAttributes;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import com.getcapacitor.JSObject;

@CapacitorPlugin(name="NativeTools")
public class NativeToolsPlugin extends Plugin {
  private byte[] pending;
  private static final String SESSION = "nc-session-v1";

  @PluginMethod public void rememberedSession(PluginCall call) {
    var prefs = getContext().getSharedPreferences(SESSION, Context.MODE_PRIVATE);
    String token = call.getString("token");
    try {
      if ("".equals(token)) {
        if (!prefs.edit().remove(SESSION).commit()) throw new IllegalStateException();
        call.resolve();
        return;
      }
      String saved = prefs.getString(SESSION, null);
      if (token == null && saved == null) {
        call.resolve(new JSObject());
        return;
      }
      KeyStore store = KeyStore.getInstance("AndroidKeyStore");
      store.load(null);
      if (!store.containsAlias(SESSION)) {
        KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(SESSION,
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        generator.generateKey();
      }
      SecretKey key = (SecretKey) store.getKey(SESSION, null);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      if (token != null) {
        if (!token.matches("[a-f0-9]{64}")) throw new IllegalArgumentException();
        cipher.init(Cipher.ENCRYPT_MODE, key);
        String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
          Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!prefs.edit().putString(SESSION, encrypted).commit()) throw new IllegalStateException();
        call.resolve();
      } else {
        String[] parts = saved.split("\\.", 2);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        String restored = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        call.resolve(new JSObject().put("token", restored));
      }
    } catch (Exception error) {
      prefs.edit().remove(SESSION).commit();
      call.reject("Não foi possível acessar a sessão protegida neste dispositivo.");
    }
  }
  @PluginMethod public void print(PluginCall call){
    getActivity().runOnUiThread(()->{try{PrintManager manager=(PrintManager)getActivity().getSystemService(Context.PRINT_SERVICE);manager.print("Nós Cuidamos",getBridge().getWebView().createPrintDocumentAdapter("Resumo pós-consultas"),new PrintAttributes.Builder().build());call.resolve();}catch(Exception e){call.reject("Não foi possível abrir a impressão.");}});
  }
  @PluginMethod public synchronized void saveDocument(PluginCall call){
    if(pending!=null){call.reject("Conclua o salvamento anterior.");return;}
    try{
      String encoded=call.getString("base64","");if(encoded.length()>15000000){call.reject("Arquivo muito grande.");return;}
      pending=Base64.decode(encoded,Base64.DEFAULT);
      String mime=call.getString("mime","application/octet-stream");
      if(!mime.equals("application/pdf")&&!mime.equals("image/png")&&!mime.equals("image/jpeg")){pending=null;call.reject("Formato não suportado.");return;}
      Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(mime);intent.putExtra(Intent.EXTRA_TITLE,call.getString("name","documento").replaceAll("[\\\\/\\p{Cntrl}]","_"));startActivityForResult(call,intent,"documentSaved");
    }catch(Exception e){pending=null;call.reject("Não foi possível abrir o seletor de arquivos.");}
  }
  @ActivityCallback private void documentSaved(PluginCall call,ActivityResult result){
    try{if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.reject("Salvamento cancelado.");return;}if(pending==null){call.reject("Tente salvar novamente.");return;}
      try(OutputStream out=getContext().getContentResolver().openOutputStream(result.getData().getData())){if(out==null)throw new Exception();out.write(pending);}call.resolve();
    }catch(Exception e){if(call!=null)call.reject("Não foi possível salvar o documento.");}finally{pending=null;}
  }
}
